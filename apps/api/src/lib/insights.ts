import { captures, db, sessions, tasks } from "@deep/db";
import { addDays, elapsedSec, localDate, mondayOf } from "@deep/shared";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import {
	heatmap,
	type SessionLite,
	timesheet,
	weekStats,
} from "./insights-core";
import { getSettings } from "./settings";
import { buildState, startOfLocalDay } from "./state";

/** Focus and break sessions that started in [from, to) local dates, with live time filled in. */
async function loadSessions(
	from: string,
	toExclusive: string,
): Promise<SessionLite[]> {
	const rows = await db.query.sessions.findMany({
		where: and(
			gte(sessions.startedAt, startOfLocalDay(from)),
			lt(sessions.startedAt, startOfLocalDay(toExclusive)),
		),
	});
	const live = (await buildState()).session;
	return rows.map((r) => ({
		id: r.id,
		kind: r.kind,
		projectId: r.projectId,
		taskId: r.taskId,
		startedAt: r.startedAt,
		endedAt: r.endedAt,
		activeSec: r.endedAt
			? (r.activeSec ?? 0)
			: live?.id === r.id
				? elapsedSec(live)
				: 0,
		focusRating: r.focusRating,
	}));
}

async function loadProjects() {
	return (await db.query.projects.findMany()).map((p) => ({
		id: p.id,
		name: p.name,
		color: p.color,
		client: p.client,
		billable: p.billable,
		hourlyRate: p.hourlyRate,
		weeklyTargetMin: p.status === "archived" ? null : p.weeklyTargetMin,
	}));
}

async function loadTasks(ids: number[]) {
	if (ids.length === 0) return [];
	const rows = await db.query.tasks.findMany({ where: inArray(tasks.id, ids) });
	return rows.map((t) => ({ id: t.id, title: t.title, energy: t.energy }));
}

const taskIds = (s: SessionLite[]) => [
	...new Set(s.map((x) => x.taskId).filter((x): x is number => x !== null)),
];

export async function weekStatsFor(anyDayInWeek: string) {
	const start = mondayOf(anyDayInWeek);
	const next = addDays(start, 7);
	const [rows, projects, settings] = await Promise.all([
		loadSessions(start, next),
		loadProjects(),
		getSettings(),
	]);
	const [taskRows, done, caps] = await Promise.all([
		loadTasks(taskIds(rows)),
		db.query.tasks.findMany({
			where: and(
				eq(tasks.status, "done"),
				gte(tasks.doneAt, startOfLocalDay(start)),
				lt(tasks.doneAt, startOfLocalDay(next)),
			),
			columns: { id: true },
		}),
		db.query.captures.findMany({
			where: and(
				gte(captures.createdAt, startOfLocalDay(start)),
				lt(captures.createdAt, startOfLocalDay(next)),
			),
		}),
	]);
	return weekStats({
		start,
		sessions: rows,
		projects,
		tasks: taskRows,
		tasksDone: done.length,
		captures: caps.map((c) => ({
			kind: c.kind,
			text: c.text,
			createdAt: c.createdAt,
		})),
		dailyTargetMin: settings.dailyTargetMin,
	});
}

export async function heatmapFor(weeks: number) {
	const today = localDate();
	const from = addDays(mondayOf(today), -7 * (weeks - 1));
	return heatmap(await loadSessions(from, addDays(today, 1)), weeks);
}

/** Timesheet for one project, or for every billable project when projectId is null. */
export async function timesheetFor(
	projectId: number | null,
	from: string,
	to: string,
) {
	const projects = await loadProjects();
	const allowed = new Set(
		projectId
			? [projectId]
			: projects.filter((p) => p.billable).map((p) => p.id),
	);
	const rows = (await loadSessions(from, addDays(to, 1))).filter(
		(s) => s.projectId !== null && allowed.has(s.projectId),
	);
	return timesheet({
		from,
		to,
		sessions: rows,
		projects,
		tasks: await loadTasks(taskIds(rows)),
	});
}
