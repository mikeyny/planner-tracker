import { activityEvents, db, projects } from "@deep/db";
import type { HeartbeatInput, HeartbeatResult, ProjectRef } from "@deep/shared";
import { eq } from "drizzle-orm";
import { broadcast } from "./bus";
import { pauseSession, resumeSession, startSession } from "./engine";
import { systemIdleSec } from "./idle";
import { projectForPath } from "./paths";
import { getSettings } from "./settings";
import {
	buildState,
	getIdleReturn,
	getOpenPause,
	getOpenSessionRow,
	pushState,
	setIdleReturn,
} from "./state";

/* ---------------- system idle ---------------- */

const IDLE_TICK_MS = 10_000;
/** Treat the user as back when input happened within this many seconds. */
const BACK_THRESHOLD_SEC = 15;

async function idleTick() {
	const open = await getOpenSessionRow();
	if (open?.kind !== "focus") return;
	const settings = await getSettings();
	const idle = systemIdleSec();
	const pause = await getOpenPause(open.id);

	if (!pause && idle >= settings.idlePauseMin * 60) {
		// Backdate the pause to the moment input stopped.
		const at = Math.max(Date.now() - idle * 1000, Date.parse(open.startedAt));
		await pauseSession("idle", new Date(at).toISOString());
		return;
	}

	if (
		pause?.reason === "idle" &&
		idle < BACK_THRESHOLD_SEC &&
		!getIdleReturn()
	) {
		const awaySec = Math.round(
			(Date.now() - Date.parse(pause.pausedAt)) / 1000,
		);
		const idleReturn = {
			sessionId: open.id,
			awaySec,
			pausedAt: pause.pausedAt,
			canEnd: awaySec >= settings.idleEndMin * 60,
		};
		setIdleReturn(idleReturn);
		broadcast({ type: "idle_return", idle: idleReturn });
		await pushState();
	}
}

export function startIdleWatcher() {
	setInterval(() => {
		idleTick().catch((err) => console.error("[idle] tick failed:", err));
	}, IDLE_TICK_MS);
}

/* ---------------- VS Code ---------------- */

interface WindowInfo {
	projectId: number | null;
	lastBeat: number;
}

const windows = new Map<string, WindowInfo>();
const lastStartPrompt = new Map<number, number>();
const lastSwitchPrompt = new Map<number, number>();

const START_PROMPT_EVERY_MS = 2 * 60 * 60 * 1000;
const SWITCH_PROMPT_EVERY_MS = 30 * 60 * 1000;
const WINDOW_STALE_MS = 10 * 60 * 1000;
const MAX_BEAT_CREDIT_SEC = 120;

async function projectRef(id: number | null): Promise<ProjectRef | null> {
	if (!id) return null;
	const p = await db.query.projects.findFirst({ where: eq(projects.id, id) });
	return p ? { id: p.id, name: p.name, color: p.color } : null;
}

async function resolveProject(input: HeartbeatInput): Promise<number | null> {
	if (input.file) {
		const fromFile = await projectForPath(input.file);
		if (fromFile) return fromFile;
	}
	for (const ws of input.workspaces) {
		const id = await projectForPath(ws);
		if (id) return id;
	}
	return null;
}

export async function handleHeartbeat(
	input: HeartbeatInput,
): Promise<HeartbeatResult> {
	const now = Date.now();
	const settings = await getSettings();
	const projectId = await resolveProject(input);
	const prev = windows.get(input.windowId);
	windows.set(input.windowId, { projectId, lastBeat: now });

	if (input.focused) {
		const credit = prev
			? Math.min(MAX_BEAT_CREDIT_SEC, Math.round((now - prev.lastBeat) / 1000))
			: 0;
		await db.insert(activityEvents).values({
			source: "vscode",
			projectId,
			workspace: input.workspaces[0] ?? null,
			file: input.file,
			language: input.language,
			branch: input.branch,
			durationSec: credit,
		});
	}

	let open = await getOpenSessionRow();
	let suggest: HeartbeatResult["suggest"] = null;

	// Reopening the project's folder resumes a session that paused when it closed.
	if (open && projectId && open.projectId === projectId) {
		const pause = await getOpenPause(open.id);
		if (pause?.reason === "vscode_closed") await resumeSession();
	}

	if (!open && projectId && input.focused && settings.vscodeStart !== "off") {
		if (settings.vscodeStart === "auto" && input.editing) {
			await startSession({ projectId, source: "vscode" });
			open = await getOpenSessionRow();
		} else if (settings.vscodeStart === "ask") {
			const last = lastStartPrompt.get(projectId) ?? 0;
			if (now - last > START_PROMPT_EVERY_MS) {
				lastStartPrompt.set(projectId, now);
				suggest = "start";
			}
		}
	}

	if (
		open &&
		open.kind === "focus" &&
		projectId &&
		open.projectId &&
		projectId !== open.projectId &&
		input.editing &&
		settings.vscodeSwitchPrompt
	) {
		const last = lastSwitchPrompt.get(projectId) ?? 0;
		if (now - last > SWITCH_PROMPT_EVERY_MS) {
			lastSwitchPrompt.set(projectId, now);
			suggest = "switch";
		}
	}

	return {
		project: await projectRef(projectId),
		suggest,
		state: await buildState(),
	};
}

export async function handleVscodeClosed(windowId: string) {
	const info = windows.get(windowId);
	windows.delete(windowId);
	const settings = await getSettings();
	if (!info?.projectId || !settings.vscodeClosePause) return;

	const open = await getOpenSessionRow();
	if (open?.kind !== "focus" || open.projectId !== info.projectId) return;

	const now = Date.now();
	const stillOpen = [...windows.values()].some(
		(w) => w.projectId === info.projectId && now - w.lastBeat < WINDOW_STALE_MS,
	);
	if (stillOpen) return;
	if (await getOpenPause(open.id)) return;
	await pauseSession("vscode_closed");
}

/** Whether VS Code currently has a window open on this project (for the UI). */
export function vscodeWindows() {
	const now = Date.now();
	return [...windows.entries()]
		.filter(([, w]) => now - w.lastBeat < WINDOW_STALE_MS)
		.map(([id, w]) => ({ id, projectId: w.projectId }));
}
