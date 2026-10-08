import { db, projects, sessionPauses, sessions, tasks } from "@deep/db";
import {
	type ActiveSession,
	type ActiveState,
	type IdleReturn,
	localDate,
	type PauseReason,
	type SessionKind,
	type SessionSource,
	type TimerMode,
} from "@deep/shared";
import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { broadcast } from "./bus";

/** A pending "you were away" prompt. Lives in memory; it only matters while the app runs. */
let idleReturn: IdleReturn | null = null;

export function setIdleReturn(v: IdleReturn | null) {
	idleReturn = v;
}
export function getIdleReturn() {
	return idleReturn;
}

export async function getOpenSessionRow() {
	return db.query.sessions.findFirst({
		where: isNull(sessions.endedAt),
		orderBy: desc(sessions.startedAt),
	});
}

export async function getOpenPause(sessionId: number) {
	return db.query.sessionPauses.findFirst({
		where: and(
			eq(sessionPauses.sessionId, sessionId),
			isNull(sessionPauses.resumedAt),
		),
	});
}

/** Sum of finished pauses in seconds (all reasons). */
async function closedPauseSec(sessionId: number): Promise<number> {
	const rows = await db
		.select()
		.from(sessionPauses)
		.where(
			and(
				eq(sessionPauses.sessionId, sessionId),
				isNotNull(sessionPauses.resumedAt),
			),
		);
	return rows.reduce(
		(acc, p) =>
			acc + (Date.parse(p.resumedAt!) - Date.parse(p.pausedAt)) / 1000,
		0,
	);
}

export async function toActiveSession(
	row: typeof sessions.$inferSelect,
): Promise<ActiveSession> {
	const [open, pausedSec, project, task] = await Promise.all([
		getOpenPause(row.id),
		closedPauseSec(row.id),
		row.projectId
			? db.query.projects.findFirst({ where: eq(projects.id, row.projectId) })
			: null,
		row.taskId
			? db.query.tasks.findFirst({ where: eq(tasks.id, row.taskId) })
			: null,
	]);
	return {
		id: row.id,
		kind: row.kind as SessionKind,
		mode: row.mode as TimerMode,
		projectId: row.projectId,
		taskId: row.taskId,
		plannedSec: row.plannedSec,
		intention: row.intention,
		startedAt: row.startedAt,
		endedAt: row.endedAt,
		pausedAt: open?.pausedAt ?? null,
		pauseReason: (open?.reason as PauseReason) ?? null,
		pausedSec,
		source: row.source as SessionSource,
		project: project
			? { id: project.id, name: project.name, color: project.color }
			: null,
		task: task ? { id: task.id, title: task.title } : null,
	};
}

/** Start of the local day as an ISO string. */
export function startOfLocalDay(date: string = localDate()): string {
	return new Date(`${date}T00:00:00`).toISOString();
}

export async function buildState(): Promise<ActiveState> {
	const row = await getOpenSessionRow();
	const since = startOfLocalDay();
	const done = await db
		.select({ activeSec: sessions.activeSec })
		.from(sessions)
		.where(
			and(
				eq(sessions.kind, "focus"),
				gte(sessions.startedAt, since),
				isNotNull(sessions.endedAt),
			),
		);
	return {
		session: row ? await toActiveSession(row) : null,
		idleReturn,
		focusCountToday: done.length,
		focusSecToday: done.reduce((a, r) => a + (r.activeSec ?? 0), 0),
		serverNow: new Date().toISOString(),
	};
}

export async function pushState() {
	broadcast({ type: "state", state: await buildState() });
}
