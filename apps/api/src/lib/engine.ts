import { db, projects, sessionPauses, sessions, tasks } from "@deep/db";
import {
	type PauseReason,
	type SessionOutcome,
	type SessionSource,
	suggestedBreakMin,
	TIMER_MODES,
	type TimerMode,
} from "@deep/shared";
import { and, eq, isNull } from "drizzle-orm";
import { broadcast, changed } from "./bus";
import { getSettings } from "./settings";
import {
	buildState,
	getIdleReturn,
	getOpenPause,
	getOpenSessionRow,
	pushState,
	setIdleReturn,
} from "./state";

export class EngineError extends Error {}

const nowIso = () => new Date().toISOString();

export interface StartInput {
	taskId?: number | null;
	projectId?: number | null;
	mode?: TimerMode;
	/** Overrides the mode's default length. 0 or null = open-ended. */
	minutes?: number | null;
	intention?: string | null;
	source?: SessionSource;
}

export async function startSession(input: StartInput) {
	const settings = await getSettings();
	const mode = input.mode ?? settings.defaultMode;

	let projectId = input.projectId ?? null;
	if (input.taskId) {
		const task = await db.query.tasks.findFirst({
			where: eq(tasks.id, input.taskId),
		});
		if (!task) throw new EngineError("That task no longer exists.");
		projectId = projectId ?? task.projectId;
	}

	const open = await getOpenSessionRow();
	if (open) await stopSession({ outcome: "progress" });

	let minutes: number | null;
	if (input.minutes !== undefined) minutes = input.minutes || null;
	else if (mode === "timebox") minutes = settings.timeboxMin;
	else minutes = TIMER_MODES[mode].workMin;

	const [row] = await db
		.insert(sessions)
		.values({
			kind: "focus",
			mode,
			projectId,
			taskId: input.taskId ?? null,
			plannedSec: minutes ? minutes * 60 : null,
			intention: input.intention?.trim() || null,
			startedAt: nowIso(),
			source: input.source ?? "manual",
		})
		.returning();
	setIdleReturn(null);
	await pushState();
	return row!;
}

export async function startBreak(minutes: number) {
	const open = await getOpenSessionRow();
	if (open) await stopSession({ outcome: "progress" });
	await db.insert(sessions).values({
		kind: "break",
		mode: open?.mode ?? "deep50",
		plannedSec: Math.max(1, Math.round(minutes)) * 60,
		startedAt: nowIso(),
		source: "manual",
	});
	await pushState();
}

export async function pauseSession(
	reason: PauseReason = "manual",
	at?: string,
) {
	const open = await getOpenSessionRow();
	if (!open) throw new EngineError("No session is running.");
	if (await getOpenPause(open.id)) return;
	await db
		.insert(sessionPauses)
		.values({ sessionId: open.id, pausedAt: at ?? nowIso(), reason });
	await pushState();
}

export async function resumeSession(reasonOverride?: PauseReason) {
	const open = await getOpenSessionRow();
	if (!open) throw new EngineError("No session is running.");
	const pause = await getOpenPause(open.id);
	if (!pause) return;
	await db
		.update(sessionPauses)
		.set({
			resumedAt: nowIso(),
			...(reasonOverride ? { reason: reasonOverride } : {}),
		})
		.where(eq(sessionPauses.id, pause.id));
	setIdleReturn(null);
	await pushState();
}

export interface StopInput {
	outcome?: SessionOutcome | null;
	leftOffNote?: string | null;
	focusRating?: number | null;
	/** End time override (used when ending at the moment you went idle). */
	at?: string;
}

/** Ends the open session. Returns a suggested break length for focus sessions. */
export async function stopSession(input: StopInput = {}) {
	const open = await getOpenSessionRow();
	if (!open) throw new EngineError("No session is running.");
	const endedAt = input.at ?? nowIso();

	const pause = await getOpenPause(open.id);
	if (pause) {
		await db
			.update(sessionPauses)
			.set({ resumedAt: endedAt < pause.pausedAt ? pause.pausedAt : endedAt })
			.where(eq(sessionPauses.id, pause.id));
	}
	const pauses = await db
		.select()
		.from(sessionPauses)
		.where(eq(sessionPauses.sessionId, open.id));
	const pausedSec = pauses.reduce(
		(acc, p) =>
			acc +
			(Date.parse(p.resumedAt ?? endedAt) - Date.parse(p.pausedAt)) / 1000,
		0,
	);
	const activeSec = Math.max(
		0,
		Math.round(
			(Date.parse(endedAt) - Date.parse(open.startedAt)) / 1000 - pausedSec,
		),
	);

	const note = input.leftOffNote?.trim() || null;
	await db
		.update(sessions)
		.set({
			endedAt,
			activeSec,
			outcome: input.outcome ?? null,
			leftOffNote: note,
			focusRating: input.focusRating ?? null,
		})
		.where(eq(sessions.id, open.id));

	if (open.kind === "focus") {
		if (input.outcome === "done" && open.taskId) {
			await db
				.update(tasks)
				.set({ status: "done", doneAt: endedAt })
				.where(eq(tasks.id, open.taskId));
		}
		if (note && open.projectId) {
			await db
				.update(projects)
				.set({ leftOffNote: note, leftOffAt: endedAt })
				.where(eq(projects.id, open.projectId));
		}
	}

	setIdleReturn(null);
	broadcast({
		type: "session_ended",
		sessionId: open.id,
		kind: open.kind as "focus" | "break",
	});
	changed("tasks", "projects");
	const state = await buildState();
	broadcast({ type: "state", state });

	return {
		activeSec,
		breakMin:
			open.kind === "focus"
				? suggestedBreakMin(
						open.mode as TimerMode,
						activeSec,
						state.focusCountToday,
					)
				: 0,
	};
}

export async function extendSession(minutes: number) {
	const open = await getOpenSessionRow();
	if (!open) throw new EngineError("No session is running.");
	const base = open.plannedSec ?? 0;
	await db
		.update(sessions)
		.set({
			plannedSec: base + Math.round(minutes * 60),
			// "Just 5 minutes" that keeps going becomes a timebox.
			...(open.mode === "just5" ? { mode: "timebox" } : {}),
		})
		.where(eq(sessions.id, open.id));
	await pushState();
}

export type IdleAction = "keep" | "break" | "discard" | "end";

/** Answer the "you were away" prompt. */
export async function resolveIdle(action: IdleAction) {
	const idle = getIdleReturn();
	const open = await getOpenSessionRow();
	if (!open) {
		setIdleReturn(null);
		await pushState();
		return;
	}
	const pause = await getOpenPause(open.id);
	if (action === "keep") {
		// Count the time away as focus: drop the pause entirely.
		if (pause)
			await db.delete(sessionPauses).where(eq(sessionPauses.id, pause.id));
		setIdleReturn(null);
		await pushState();
	} else if (action === "break") {
		await resumeSession("break");
	} else if (action === "discard") {
		await resumeSession("discarded");
	} else {
		const at = pause?.pausedAt ?? idle?.pausedAt;
		await stopSession({ outcome: "progress", at });
	}
}

/** Resume an idle pause automatically when the user comes back but don't decide for them. */
export async function hasIdlePause() {
	const open = await getOpenSessionRow();
	if (!open) return null;
	const pause = await db.query.sessionPauses.findFirst({
		where: and(
			eq(sessionPauses.sessionId, open.id),
			isNull(sessionPauses.resumedAt),
		),
	});
	return pause?.reason === "idle" ? { open, pause } : null;
}
