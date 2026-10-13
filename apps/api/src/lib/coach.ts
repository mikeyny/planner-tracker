import { db, projects, sessions, tasks, timeBlocks } from "@deep/db";
import {
	type CoachAction,
	type CoachMode,
	type CoachServerMessage,
	type ExtractedTask,
	elapsedSec,
	formatMinutes,
	localDate,
	minToHhmm,
	TIMER_MODES,
} from "@deep/shared";
import {
	type FunctionDeclaration,
	type LiveServerMessage,
	Modality,
	type Session,
	Type,
} from "@google/genai";
import type { ServerWebSocket } from "bun";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ai, geminiAvailable, logRun } from "./ai";
import { heatmapFor, weekStatsFor } from "./insights";
import { getSettings } from "./settings";
import { getOpenSessionRow, pushState, toActiveSession } from "./state";
import { capacity, multipliers } from "./stats";

export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";

/** Calls end on their own after this long, so a forgotten window can't run up a bill. */
const MAX_SEC: Record<CoachMode, number> = {
	checkin: 180,
	checkout: 180,
	plan: 900,
};

export interface CoachSocketData {
	kind: "coach";
	mode: CoachMode;
	call?: CoachCall;
}

/* ---------------- context ---------------- */

const PERSONA = `You are Deep's focus coach: a calm, warm, practical body-double for a software developer who struggles with focus.
How you talk:
- Speak in short, natural sentences. One question at a time. Never lecture or list.
- Be specific to their actual work (use the context below), not generic motivation.
- Ground your nudges in what works: one clear next action, a small first step, time-boxing, writing distractions down instead of acting on them, and protecting deep work for their best hours.
- Never guilt-trip. If they're stuck, make the next step smaller.
- Keep the whole conversation brief; they want to get back to work.
- Speak English unless they speak another language.
- "Deep" is the name of the app, not the user. You don't know their name; don't use one.
- Only call a tool after hearing the user's answer. Never act on your own guess.`;

const MODE_GUIDE: Record<CoachMode, string> = {
	checkin: `This is a check-in at the START of a focus session (like a body-double sitting down next to them).
1. Greet them in a few words and ask what exactly they want to have done when the timer ends.
2. If their answer is vague, ask for the very first small step.
3. Once they've answered, call set_intention with a crisp intention (max 12 words, first person, e.g. "Get the signature test passing").
4. Say a one-sentence send-off that mentions the session length (e.g. "Great, see you in 50 minutes.") and call end_call.
The whole check-in should take under a minute.`,
	checkout: `This is a check-out at the END of a focus session.
1. Ask briefly how it went.
2. Ask where they left off and what the next step is, unless they already said.
3. Call fill_wrap_up: outcome is "done" if the task/goal is finished, "blocked" if they're stuck on something outside their control, else "progress". left_off_note is a 1–2 sentence note to their future self in first person: what's done and the exact next step. focus_rating 1–5 only if they said how focused they felt, otherwise omit it.
4. Then suggest a real break in one sentence (stand up, water, look out of a window; not their phone) and call end_call.`,
	plan: `This is a planning conversation for TODAY.
1. Ask what's on their mind for today (or react to the plan in the context if they already have one).
2. Help them choose at most 3 "big rocks" that actually fit the free time, given their usual estimate overrun. Push back gently on overcommitting.
3. Suggest putting deep work in their best focus hours and around meetings.
4. Whenever concrete NEW tasks come up, call propose_tasks. Never propose a task that is already in "Already planned for today"; for inbox items they want today, propose them with the same title. The app shows proposals as suggestions and nothing is saved until they confirm, so keep titles short and imperative.
5. When the plan is clear, summarise it in two sentences and call end_call.`,
};

async function sessionContext() {
	const row = await getOpenSessionRow();
	if (row?.kind !== "focus") return { lines: [], session: null };
	const s = await toActiveSession(row);
	const project = s.projectId
		? await db.query.projects.findFirst({
				where: eq(projects.id, s.projectId),
			})
		: null;
	const planned = s.plannedSec ? Math.round(s.plannedSec / 60) : null;
	return {
		session: s,
		lines: [
			`Current focus session: ${TIMER_MODES[s.mode].label}${planned ? `, ${planned} minutes` : ", open-ended"}, ${Math.round(elapsedSec(s) / 60)} minutes in.`,
			`Project: ${s.project?.name ?? "none"}. Task: ${s.task?.title ?? "none"}.`,
			s.intention ? `Intention they typed: ${s.intention}` : "",
			project?.leftOffNote
				? `Their note from last time on this project: ${project.leftOffNote}`
				: "",
		].filter(Boolean),
	};
}

async function planContext() {
	const today = localDate();
	const [todayTasks, inbox, meetings, cap, mult, week, heat, settings] =
		await Promise.all([
			db.query.tasks.findMany({
				where: and(eq(tasks.plannedFor, today), eq(tasks.status, "open")),
				orderBy: asc(tasks.sortOrder),
			}),
			db.query.tasks.findMany({
				where: and(isNull(tasks.plannedFor), eq(tasks.status, "open")),
				orderBy: asc(tasks.createdAt),
				limit: 12,
			}),
			db.query.timeBlocks.findMany({
				where: and(eq(timeBlocks.date, today), eq(timeBlocks.kind, "meeting")),
				orderBy: asc(timeBlocks.startMin),
			}),
			capacity(today),
			multipliers(),
			weekStatsFor(today),
			heatmapFor(4),
			getSettings(),
		]);
	const names = new Map(
		(await db.query.projects.findMany()).map((p) => [p.id, p.name]),
	);
	const task = (t: typeof tasks.$inferSelect) =>
		`- ${t.isTop3 ? "[big rock] " : ""}${t.title}${t.projectId ? ` (${names.get(t.projectId)})` : ""}${t.estimateMin ? `, ${t.estimateMin} min` : ""}${t.rolloverCount >= 2 ? `, carried over ${t.rolloverCount} times` : ""}`;
	return [
		`Workday ${settings.workdayStart}–${settings.shutdownTime}. Daily deep-work target ${formatMinutes(settings.dailyTargetMin)}.`,
		`Free time left today after meetings: ${formatMinutes(cap.availableMin)}. Planned: ${formatMinutes(cap.plannedMin)}${mult.overall.value ? ` (they usually take ${mult.overall.value}x their estimates, so really about ${formatMinutes(cap.adjustedMin)})` : ""}.`,
		meetings.length
			? `Meetings today: ${meetings.map((m) => `${minToHhmm(m.startMin)} ${m.title} (${m.durationMin} min)`).join("; ")}.`
			: "No meetings today.",
		heat.bestHours.length
			? `Their best focus hours lately: ${heat.bestHours.map((h) => `${h}:00`).join(", ")}.`
			: "",
		todayTasks.length
			? `Already planned for today:\n${todayTasks.map(task).join("\n")}`
			: "Nothing planned for today yet.",
		inbox.length ? `Inbox (unplanned):\n${inbox.map(task).join("\n")}` : "",
		week.perProject.some((p) => p.targetMin)
			? `This week vs weekly targets: ${week.perProject
					.filter((p) => p.targetMin)
					.map(
						(p) =>
							`${p.name} ${formatMinutes(p.sec / 60)} of ${formatMinutes(p.targetMin!)}`,
					)
					.join(", ")}.`
			: "",
		`Projects: ${[...names.values()].join(", ") || "none"}.`,
	].filter(Boolean);
}

/* ---------------- tools ---------------- */

const endCall: FunctionDeclaration = {
	name: "end_call",
	description: "End the conversation after your final sentence.",
	parameters: { type: Type.OBJECT, properties: {} },
};

const TOOLS: Record<CoachMode, FunctionDeclaration[]> = {
	checkin: [
		{
			name: "set_intention",
			description: "Save what they will get done in this focus session.",
			parameters: {
				type: Type.OBJECT,
				properties: {
					intention: {
						type: Type.STRING,
						description: "Max 12 words, first person, concrete outcome",
					},
				},
				required: ["intention"],
			},
		},
		endCall,
	],
	checkout: [
		{
			name: "fill_wrap_up",
			description:
				"Fill in the end-of-session form for them to confirm: outcome, where they left off, focus rating.",
			parameters: {
				type: Type.OBJECT,
				properties: {
					outcome: { type: Type.STRING, enum: ["done", "progress", "blocked"] },
					left_off_note: { type: Type.STRING },
					focus_rating: {
						type: Type.INTEGER,
						description: "1–5, only if they said",
					},
				},
				required: ["outcome", "left_off_note"],
			},
		},
		endCall,
	],
	plan: [
		{
			name: "propose_tasks",
			description:
				"Suggest tasks for today. They are shown to the user to confirm; nothing is saved yet.",
			parameters: {
				type: Type.OBJECT,
				properties: {
					tasks: {
						type: Type.ARRAY,
						items: {
							type: Type.OBJECT,
							properties: {
								title: { type: Type.STRING },
								project: {
									type: Type.STRING,
									description: "One of their project names, if it fits",
								},
								estimate_min: { type: Type.INTEGER },
								big_rock: { type: Type.BOOLEAN },
								energy: {
									type: Type.STRING,
									enum: ["deep", "shallow", "admin"],
								},
								first_step: { type: Type.STRING },
							},
							required: ["title"],
						},
					},
				},
				required: ["tasks"],
			},
		},
		endCall,
	],
};

/* ---------------- the call ---------------- */

type Ws = ServerWebSocket<CoachSocketData>;

export class CoachCall {
	private session: Session | null = null;
	private ended = false;
	private endAfterTurn = false;
	private started = Date.now();
	private timers: Timer[] = [];
	private usage = { promptTokenCount: 0, candidatesTokenCount: 0 };
	private projectNames: { id: number; name: string }[] = [];
	/** Tools that write anything wait until the user has actually said something. */
	private heardUser = false;

	constructor(
		private ws: Ws,
		private mode: CoachMode,
	) {}

	private send(msg: CoachServerMessage) {
		try {
			this.ws.send(JSON.stringify(msg));
		} catch {
			// The app closed the window.
		}
	}

	async start() {
		if (!geminiAvailable()) {
			this.finish("error", "The coach needs a Gemini API key in .env.");
			return;
		}
		const settings = await getSettings();
		const { lines, session } = await sessionContext();
		if ((this.mode === "checkin" || this.mode === "checkout") && !session) {
			this.finish("error", "No focus session is running.");
			return;
		}
		const extra = this.mode === "plan" ? await planContext() : [];
		this.projectNames = (await db.query.projects.findMany()).map((p) => ({
			id: p.id,
			name: p.name,
		}));
		const now = new Date();
		const context = [
			`It's ${now.toLocaleDateString("en-GB", { weekday: "long" })} ${minToHhmm(now.getHours() * 60 + now.getMinutes())}.`,
			...lines,
			...extra,
		].join("\n");

		try {
			this.session = await ai().live.connect({
				model: LIVE_MODEL,
				config: {
					responseModalities: [Modality.AUDIO],
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: { voiceName: settings.coachVoice },
						},
					},
					inputAudioTranscription: {},
					outputAudioTranscription: {},
					systemInstruction: `${PERSONA}\n\n${MODE_GUIDE[this.mode]}\n\nContext:\n${context}`,
					tools: [{ functionDeclarations: TOOLS[this.mode] }],
				},
				callbacks: {
					onmessage: (m) => this.onMessage(m),
					onerror: (e) =>
						this.finish("error", `Voice connection failed: ${e.message ?? e}`),
					onclose: (e) => {
						if (!this.ended)
							this.finish(
								e.code === 1000 ? "done" : "error",
								e.code === 1000
									? undefined
									: `Voice connection closed (${e.reason || e.code}).`,
							);
					},
				},
			});
		} catch (err) {
			this.finish(
				"error",
				`Couldn't reach Gemini Live: ${err instanceof Error ? err.message : String(err)}`,
			);
			return;
		}
		this.timers.push(
			setTimeout(() => this.finish("time"), MAX_SEC[this.mode] * 1000),
		);
		this.send({ type: "ready", model: LIVE_MODEL });
		// The model only speaks when spoken to: give it its cue.
		this.session.sendRealtimeInput({
			text:
				this.mode === "plan"
					? "(The user opened the planning coach. Greet them and start.)"
					: this.mode === "checkin"
						? "(The focus session just started. Start the check-in.)"
						: "(The user is ending the session. Start the check-out.)",
		});
	}

	/** 16 kHz mono PCM16 from the microphone. */
	audio(pcm: Uint8Array) {
		if (this.ended || !this.session) return;
		this.session.sendRealtimeInput({
			audio: {
				data: Buffer.from(pcm).toString("base64"),
				mimeType: "audio/pcm;rate=16000",
			},
		});
	}

	text(text: string) {
		if (this.ended || !this.session) return;
		this.heardUser = true;
		this.session.sendRealtimeInput({ text });
	}

	private onMessage(m: LiveServerMessage) {
		if (m.usageMetadata) {
			this.usage.promptTokenCount += m.usageMetadata.promptTokenCount ?? 0;
			this.usage.candidatesTokenCount +=
				m.usageMetadata.responseTokenCount ?? 0;
		}
		const sc = m.serverContent;
		if (sc) {
			for (const part of sc.modelTurn?.parts ?? []) {
				if (part.inlineData?.data) {
					try {
						this.ws.send(Buffer.from(part.inlineData.data, "base64"));
					} catch {
						// closed
					}
				}
			}
			if (sc.inputTranscription?.text?.trim()) this.heardUser = true;
			if (sc.inputTranscription?.text)
				this.send({
					type: "transcript",
					who: "you",
					text: sc.inputTranscription.text,
				});
			if (sc.outputTranscription?.text)
				this.send({
					type: "transcript",
					who: "coach",
					text: sc.outputTranscription.text,
				});
			if (sc.interrupted) this.send({ type: "interrupted" });
			if (sc.turnComplete) {
				this.send({ type: "turn_complete" });
				if (this.endAfterTurn) this.finish("done");
			}
		}
		if (m.toolCall?.functionCalls?.length) {
			this.onTools(m.toolCall.functionCalls).catch((err) =>
				console.error("[coach] tool call failed:", err),
			);
		}
	}

	private async onTools(
		calls: { id?: string; name?: string; args?: Record<string, unknown> }[],
	) {
		const responses = [];
		for (const call of calls) {
			const result = await this.runTool(call.name ?? "", call.args ?? {});
			responses.push({ id: call.id, name: call.name, response: { result } });
		}
		this.session?.sendToolResponse({ functionResponses: responses });
	}

	private async runTool(name: string, args: Record<string, unknown>) {
		if (name !== "end_call" && !this.heardUser)
			return "Not saved: the user hasn't answered yet. Ask your question and wait for their answer.";
		switch (name) {
			case "set_intention": {
				const intention = String(args.intention ?? "")
					.trim()
					.slice(0, 300);
				const open = await getOpenSessionRow();
				if (!open || !intention) return "No session to update.";
				await db
					.update(sessions)
					.set({ intention })
					.where(eq(sessions.id, open.id));
				await pushState();
				this.action({ action: "intention", intention });
				return "Saved.";
			}
			case "fill_wrap_up": {
				const outcome = ["done", "progress", "blocked"].includes(
					String(args.outcome),
				)
					? (args.outcome as "done" | "progress" | "blocked")
					: "progress";
				const rating = Number(args.focus_rating);
				this.action({
					action: "wrap_up",
					outcome,
					note: String(args.left_off_note ?? "")
						.trim()
						.slice(0, 2000),
					rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
				});
				return "Filled in. They'll confirm it on screen.";
			}
			case "propose_tasks": {
				const list = Array.isArray(args.tasks) ? args.tasks : [];
				const proposed = list
					.map((t) => this.toTask(t as Record<string, unknown>))
					.filter((t): t is ExtractedTask => t !== null);
				if (proposed.length) this.action({ action: "tasks", tasks: proposed });
				return `Shown ${proposed.length} task(s) on screen for them to confirm.`;
			}
			case "end_call":
				this.endAfterTurn = true;
				// If the goodbye never comes, hang up anyway.
				this.timers.push(setTimeout(() => this.finish("done"), 12_000));
				return "OK. Say your last sentence now; the call ends after it.";
			default:
				return "Unknown tool.";
		}
	}

	private toTask(t: Record<string, unknown>): ExtractedTask | null {
		const title = String(t.title ?? "").trim();
		if (!title) return null;
		const projectName = String(t.project ?? "").toLowerCase();
		const project = projectName
			? this.projectNames.find(
					(p) =>
						p.name.toLowerCase() === projectName ||
						projectName.includes(p.name.toLowerCase()),
				)
			: undefined;
		const est = Number(t.estimate_min);
		const energy = String(t.energy ?? "");
		return {
			title: title.slice(0, 200),
			projectId: project?.id ?? null,
			estimateMin: est > 0 ? Math.min(480, Math.max(5, Math.round(est))) : null,
			energy: ["deep", "shallow", "admin"].includes(energy)
				? (energy as ExtractedTask["energy"])
				: null,
			nextAction: String(t.first_step ?? "").trim() || null,
			isTop3: Boolean(t.big_rock),
			dueDate: null,
			meetingAt: null,
		};
	}

	private action(a: CoachAction) {
		this.send({ type: "action", ...a });
	}

	/** End the call (idempotent): tell the app, close Gemini, log the run. */
	finish(reason: "done" | "time" | "error" | "hangup", message?: string) {
		if (this.ended) return;
		this.ended = true;
		for (const t of this.timers) clearTimeout(t);
		if (reason !== "hangup") this.send({ type: "ended", reason, message });
		try {
			this.session?.close();
		} catch {
			// already closed
		}
		if (this.session || reason === "error")
			logRun(
				`coach_${this.mode}`,
				this.started,
				reason !== "error",
				reason === "error" ? (message ?? null) : null,
				this.usage,
				LIVE_MODEL,
			);
		if (reason !== "hangup") {
			// Let the last audio reach the app before closing the socket.
			setTimeout(() => {
				try {
					this.ws.close(1000, reason);
				} catch {
					// gone
				}
			}, 250);
		}
	}
}

export function parseCoachMode(v: string | null): CoachMode | null {
	return v === "checkin" || v === "checkout" || v === "plan" ? v : null;
}
