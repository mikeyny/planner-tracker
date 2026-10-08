import { aiRuns, db } from "@deep/db";
import type { Energy, ExtractedTask } from "@deep/shared";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export class AiError extends Error {}

/**
 * These are small structured tasks: keep model "thinking" to a minimum for speed.
 * Gemini 3 takes a thinking level; 2.5 Flash takes a token budget.
 */
function thinkingConfig() {
	if (MODEL.startsWith("gemini-3"))
		return { thinkingLevel: ThinkingLevel.MINIMAL };
	if (MODEL.includes("flash")) return { thinkingBudget: 0 };
	return undefined;
}

export function geminiAvailable() {
	return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModel() {
	return MODEL;
}

let client: GoogleGenAI | null = null;
function ai() {
	if (!process.env.GEMINI_API_KEY) throw new AiError("No Gemini API key set.");
	client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
	return client;
}

/** Call Gemini for JSON matching `schema`, logging the run. */
async function generateJson<T>(
	feature: string,
	prompt: string,
	schema: object,
): Promise<T> {
	const started = Date.now();
	try {
		const res = await ai().models.generateContent({
			model: MODEL,
			contents: prompt,
			config: {
				responseMimeType: "application/json",
				responseSchema: schema,
				temperature: 0.3,
				thinkingConfig: thinkingConfig(),
			},
		});
		const text = res.text?.trim();
		if (!text) throw new AiError("Gemini returned an empty response.");
		const parsed = JSON.parse(text) as T;
		await logRun(feature, started, true, null, res.usageMetadata);
		return parsed;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await logRun(feature, started, false, msg);
		throw err instanceof AiError
			? err
			: new AiError(`Gemini request failed: ${msg}`);
	}
}

async function logRun(
	feature: string,
	started: number,
	ok: boolean,
	error: string | null,
	usage?: { promptTokenCount?: number; candidatesTokenCount?: number },
) {
	try {
		await db.insert(aiRuns).values({
			feature,
			model: MODEL,
			ok,
			error,
			ms: Date.now() - started,
			inputTokens: usage?.promptTokenCount ?? null,
			outputTokens: usage?.candidatesTokenCount ?? null,
		});
	} catch {
		// Logging must never break the feature.
	}
}

/* ---------------- brain dump -> tasks ---------------- */

interface ProjectHint {
	id: number;
	name: string;
}

const taskSchema = {
	type: Type.OBJECT,
	properties: {
		title: {
			type: Type.STRING,
			description: "Short imperative task title, max ~8 words",
		},
		projectId: { type: Type.INTEGER, nullable: true },
		estimateMin: { type: Type.INTEGER, nullable: true },
		energy: {
			type: Type.STRING,
			enum: ["deep", "shallow", "admin"],
			nullable: true,
		},
		nextAction: {
			type: Type.STRING,
			nullable: true,
			description: "The very first physical step, under 10 words",
		},
		isTop3: { type: Type.BOOLEAN },
		dueDate: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD" },
		meetingAt: {
			type: Type.STRING,
			nullable: true,
			description:
				"24h HH:MM start time if this is a meeting or call at a set time",
		},
	},
	required: [
		"title",
		"projectId",
		"estimateMin",
		"energy",
		"nextAction",
		"isTop3",
		"dueDate",
		"meetingAt",
	],
	propertyOrdering: [
		"title",
		"projectId",
		"estimateMin",
		"energy",
		"nextAction",
		"isTop3",
		"dueDate",
		"meetingAt",
	],
};

export async function extractTasks(
	text: string,
	projects: ProjectHint[],
	today: string,
): Promise<{ tasks: ExtractedTask[]; ai: boolean }> {
	if (!geminiAvailable())
		return { tasks: naiveExtract(text, projects), ai: false };
	const weekday = new Date(`${today}T12:00:00`).toLocaleDateString("en-GB", {
		weekday: "long",
	});
	const prompt = `You turn a spoken brain dump into a clean task list for a software developer's day.

Today is ${weekday} ${today}.
Projects (id: name):
${projects.map((p) => `${p.id}: ${p.name}`).join("\n") || "(none yet)"}

Rules:
- One task per distinct piece of work. Merge duplicates. Ignore filler and feelings, but keep the work they refer to.
- projectId: match to a project above when the speech clearly refers to it (names may be misspelled by speech recognition, e.g. "cloud light" = "Cloudlyte"). Otherwise null.
- estimateMin: realistic minutes (5–240). Use what the speaker said if they gave a time.
- energy: "deep" for focused building/writing/problem solving, "shallow" for communication and small edits, "admin" for chores.
- nextAction: a concrete first step that takes under 5 minutes to start.
- isTop3: true for at most 3 tasks that matter most today (things the speaker stressed, deadlines, avoided work). Never for meetings.
- dueDate: null unless the speaker named a deadline ("before Friday", "by the 15th"). Do not use today's date just because the work is for today. Resolve weekdays relative to today.
- meetingAt: for meetings, calls and appointments at a set time, the 24-hour start time ("a call at 2" in a workday = "14:00"). estimateMin is then the meeting length (default 30). null for normal work.

Brain dump:
"""${text}"""`;
	const tasks = await generateJson<ExtractedTask[]>("extract_tasks", prompt, {
		type: Type.ARRAY,
		items: taskSchema,
	});
	const ids = new Set(projects.map((p) => p.id));
	let top = 0;
	return {
		ai: true,
		tasks: tasks
			.filter((t) => t.title?.trim())
			.map((t) => ({
				title: t.title.trim(),
				projectId: t.projectId && ids.has(t.projectId) ? t.projectId : null,
				estimateMin: t.estimateMin
					? Math.min(480, Math.max(5, t.estimateMin))
					: null,
				energy: (["deep", "shallow", "admin"] as const).includes(
					t.energy as Energy,
				)
					? (t.energy as Energy)
					: null,
				nextAction: t.nextAction?.trim() || null,
				isTop3: t.isTop3 && top++ < 3,
				dueDate:
					/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate ?? "") &&
					// The model sometimes stamps today on everything; keep it only if a same-day deadline was said.
					(t.dueDate !== today ||
						/\b(today|tonight|end of (the )?day|eod)\b/i.test(text))
						? t.dueDate
						: null,
				meetingAt: /^\d{2}:\d{2}$/.test(t.meetingAt ?? "") ? t.meetingAt : null,
			})),
	};
}

/** Offline fallback: split on sentences and joining words, match project names. */
export function naiveExtract(
	text: string,
	projects: ProjectHint[],
): ExtractedTask[] {
	const raw = text
		.split(
			/[.;!?\n]+|,\s*(?:and\s+)?|\s+(?:and then|then|also|and also|oh and|plus)\s+/i,
		)
		.map((s) =>
			s
				.replace(
					/^(so|and|oh|um|uh|okay|ok|well|i (?:really )?(?:need|have|want) to|today i (?:need|have) to)\b[\s,]*/gi,
					"",
				)
				.trim(),
		)
		.filter((s) => s.split(/\s+/).length >= 2);
	// "…the webhook, which I keep putting off" belongs to the previous task.
	const parts: string[] = [];
	for (const s of raw) {
		if (/^(which|that|because|since|but|as)\b/i.test(s) && parts.length) {
			parts[parts.length - 1] += `, ${s}`;
		} else parts.push(s);
	}
	return parts.slice(0, 15).map((s) => {
		const match = projects.find((p) => mentions(s, p.name));
		return {
			title: s.charAt(0).toUpperCase() + s.slice(1),
			projectId: match?.id ?? null,
			estimateMin: 30,
			energy: null,
			nextAction: null,
			isTop3: false,
			dueDate: null,
			meetingAt: null,
		};
	});
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Whether `text` names the project, tolerating speech-recognition spellings ("CloudLite" ≈ "Cloudlyte"). */
function mentions(text: string, name: string): boolean {
	const target = letters(name);
	if (!target) return false;
	if (letters(text).includes(target)) return true;
	const words = text.split(/\s+/).map(letters).filter(Boolean);
	const maxDist = Math.max(1, Math.floor(target.length / 4));
	for (let i = 0; i < words.length; i++) {
		// Compare single words and adjacent pairs ("agri ledger").
		for (const cand of [words[i]!, `${words[i]}${words[i + 1] ?? ""}`]) {
			if (
				Math.abs(cand.length - target.length) <= maxDist &&
				editDistance(cand, target) <= maxDist
			)
				return true;
		}
	}
	return false;
}

function editDistance(a: string, b: string): number {
	const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let prev = dp[0]!;
		dp[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = dp[j]!;
			dp[j] = Math.min(
				dp[j]! + 1,
				dp[j - 1]! + 1,
				prev + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
			prev = tmp;
		}
	}
	return dp[b.length]!;
}

/* ---------------- make it smaller ---------------- */

export async function breakdownTask(
	title: string,
	notes: string | null,
	estimateMin: number | null,
): Promise<{ title: string; estimateMin: number }[]> {
	const prompt = `Break this task into 3–6 concrete steps a developer can each finish in 25 minutes or less.
The first step must be trivially easy to start (under 5 minutes of thinking).
Task: ${title}
${notes ? `Notes: ${notes}\n` : ""}${estimateMin ? `Whole-task estimate: ${estimateMin} min\n` : ""}
Return short imperative titles.`;
	const steps = await generateJson<{ title: string; estimateMin: number }[]>(
		"breakdown",
		prompt,
		{
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					title: { type: Type.STRING },
					estimateMin: { type: Type.INTEGER },
				},
				required: ["title", "estimateMin"],
			},
		},
	);
	return steps
		.filter((s) => s.title?.trim())
		.slice(0, 8)
		.map((s) => ({
			title: s.title.trim(),
			estimateMin: Math.min(50, Math.max(5, s.estimateMin || 25)),
		}));
}

/* ---------------- command bar ---------------- */

export interface AiCommand {
	action: "start" | "add_task" | "capture" | "navigate" | "answer";
	projectId: number | null;
	taskId: number | null;
	title: string | null;
	minutes: number | null;
	view: string | null;
	answer: string | null;
}

export async function interpretCommand(
	text: string,
	context: {
		projects: ProjectHint[];
		tasks: { id: number; title: string; projectId: number | null }[];
	},
): Promise<AiCommand> {
	const prompt = `You are the command bar of a focus planner. Turn the user's request into one action.

Actions:
- start: start a focus session. Set taskId if it matches an open task, otherwise projectId. minutes if given.
- add_task: create a task. title (imperative), projectId if mentioned, minutes = estimate if given.
- capture: save a passing thought. title = the thought.
- navigate: open a view. view is one of: today, inbox, projects, plan, shutdown, stats, settings.
- answer: anything else; put a one-sentence reply in answer.

Projects: ${JSON.stringify(context.projects)}
Open tasks: ${JSON.stringify(context.tasks.slice(0, 60))}

Request: """${text}"""`;
	return generateJson<AiCommand>("command", prompt, {
		type: Type.OBJECT,
		properties: {
			action: {
				type: Type.STRING,
				enum: ["start", "add_task", "capture", "navigate", "answer"],
			},
			projectId: { type: Type.INTEGER, nullable: true },
			taskId: { type: Type.INTEGER, nullable: true },
			title: { type: Type.STRING, nullable: true },
			minutes: { type: Type.INTEGER, nullable: true },
			view: { type: Type.STRING, nullable: true },
			answer: { type: Type.STRING, nullable: true },
		},
		required: [
			"action",
			"projectId",
			"taskId",
			"title",
			"minutes",
			"view",
			"answer",
		],
	});
}

/* ---------------- shutdown summary ---------------- */

export async function summarizeDay(facts: string): Promise<string> {
	const prompt = `Write a 2–3 sentence end-of-day summary for the person below, in second person.
Be specific and kind, never guilt-tripping. Mention one thing that went well, one pattern worth noticing,
and what tomorrow should start with. No bullet points, no emoji.

${facts}`;
	const res = await generateJson<{ summary: string }>(
		"shutdown_summary",
		prompt,
		{
			type: Type.OBJECT,
			properties: { summary: { type: Type.STRING } },
			required: ["summary"],
		},
	);
	return res.summary.trim();
}
