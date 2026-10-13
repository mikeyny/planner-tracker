import { captures, db, projects, sessions, tasks, timeBlocks } from "@deep/db";
import {
	type DayStats,
	elapsedSec,
	hhmmToMin,
	localDate,
	type Multiplier,
	type ProjectTime,
} from "@deep/shared";
import { and, asc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { spentByTask } from "./serialize";
import { getSettings } from "./settings";
import { buildState, startOfLocalDay } from "./state";

function nextDay(date: string) {
	const d = new Date(`${date}T12:00:00`);
	d.setDate(d.getDate() + 1);
	return localDate(d);
}

export async function sessionsForDay(date: string) {
	return db.query.sessions.findMany({
		where: and(
			gte(sessions.startedAt, startOfLocalDay(date)),
			lt(sessions.startedAt, startOfLocalDay(nextDay(date))),
		),
		orderBy: asc(sessions.startedAt),
	});
}

export async function dayStats(date: string): Promise<DayStats> {
	const settings = await getSettings();
	const rows = (await sessionsForDay(date)).filter((s) => s.kind === "focus");
	const state = await buildState();
	const live = state.session?.kind === "focus" ? state.session : null;

	const projectRows = await db.query.projects.findMany();
	const byId = new Map(projectRows.map((p) => [p.id, p]));
	const per = new Map<number | null, number>();
	let focusSec = 0;
	let switches = 0;
	let prevProject: number | null | undefined;

	for (const s of rows) {
		const sec = s.endedAt
			? (s.activeSec ?? 0)
			: live?.id === s.id
				? elapsedSec(live)
				: 0;
		focusSec += sec;
		per.set(s.projectId, (per.get(s.projectId) ?? 0) + sec);
		if (prevProject !== undefined && s.projectId !== prevProject) switches++;
		prevProject = s.projectId;
	}

	const perProject: ProjectTime[] = [...per.entries()]
		.map(([projectId, sec]) => {
			const p = projectId ? byId.get(projectId) : undefined;
			return {
				projectId,
				name: p?.name ?? "No project",
				color: p?.color ?? "#6f6a78",
				sec,
			};
		})
		.filter((p) => p.sec > 0)
		.sort((a, b) => b.sec - a.sec);

	const dayStart = startOfLocalDay(date);
	const dayEnd = startOfLocalDay(nextDay(date));
	const done = await db.query.tasks.findMany({
		where: and(
			eq(tasks.status, "done"),
			gte(tasks.doneAt, dayStart),
			lt(tasks.doneAt, dayEnd),
		),
	});
	const caps = await db.query.captures.findMany({
		where: and(
			gte(captures.createdAt, dayStart),
			lt(captures.createdAt, dayEnd),
		),
	});

	return {
		date,
		focusSec,
		sessions: rows.length,
		tasksDone: done.length,
		urges: caps.filter((c) => c.kind === "urge").length,
		interruptions: caps.filter((c) => c.kind === "interruption").length,
		switches,
		perProject,
		targetMin: settings.dailyTargetMin,
	};
}

const MIN_SAMPLES = 3;

/** actual ÷ estimate for tasks finished in the last 60 days, per project and overall. */
export async function multipliers(): Promise<{
	overall: Multiplier;
	perProject: Multiplier[];
}> {
	const since = new Date(Date.now() - 60 * 86400_000).toISOString();
	const done = await db.query.tasks.findMany({
		where: and(
			eq(tasks.status, "done"),
			gte(tasks.doneAt, since),
			isNotNull(tasks.estimateMin),
		),
	});
	const withEstimate = done.filter((t) => (t.estimateMin ?? 0) > 0);
	const ids = withEstimate.map((t) => t.id);
	const spentRows = ids.length
		? await db
				.select({ taskId: sessions.taskId, activeSec: sessions.activeSec })
				.from(sessions)
				.where(and(inArray(sessions.taskId, ids), isNotNull(sessions.endedAt)))
		: [];
	const spent = new Map<number, number>();
	for (const r of spentRows)
		spent.set(r.taskId!, (spent.get(r.taskId!) ?? 0) + (r.activeSec ?? 0));

	const groups = new Map<
		number | null,
		{ est: number; act: number; n: number }
	>();
	const all = { est: 0, act: 0, n: 0 };
	for (const t of withEstimate) {
		const act = (spent.get(t.id) ?? 0) / 60;
		if (act < 1) continue; // never tracked: no signal
		const g = groups.get(t.projectId) ?? { est: 0, act: 0, n: 0 };
		g.est += t.estimateMin!;
		g.act += act;
		g.n++;
		groups.set(t.projectId, g);
		all.est += t.estimateMin!;
		all.act += act;
		all.n++;
	}

	const projectRows = await db.query.projects.findMany();
	const byId = new Map(projectRows.map((p) => [p.id, p]));
	const value = (g: { est: number; act: number; n: number }) =>
		g.n >= MIN_SAMPLES && g.est > 0
			? Math.round((g.act / g.est) * 100) / 100
			: null;

	return {
		overall: {
			projectId: null,
			name: "All projects",
			color: "#eceaf0",
			value: value(all),
			samples: all.n,
		},
		perProject: [...groups.entries()].map(([projectId, g]) => {
			const p = projectId ? byId.get(projectId) : undefined;
			return {
				projectId,
				name: p?.name ?? "No project",
				color: p?.color ?? "#6f6a78",
				value: value(g),
				samples: g.n,
			};
		}),
	};
}

/** How much is planned for `date` versus the free time left in the workday. */
export async function capacity(date: string) {
	const settings = await getSettings();
	const open = await db.query.tasks.findMany({
		where: and(eq(tasks.plannedFor, date), eq(tasks.status, "open")),
	});
	const { overall, perProject } = await multipliers();
	const multOf = (projectId: number | null) =>
		perProject.find((m) => m.projectId === projectId)?.value ??
		overall.value ??
		1;

	const spent = await spentByTask(open.map((t) => t.id));
	let plannedMin = 0;
	let adjustedMin = 0;
	for (const t of open) {
		const est = t.estimateMin ?? 30;
		const spentMin = (spent.get(t.id) ?? 0) / 60;
		plannedMin += Math.max(0, est - spentMin);
		adjustedMin += Math.max(0, est - spentMin) * multOf(t.projectId);
	}

	const startMin = hhmmToMin(settings.workdayStart);
	const endMin = hhmmToMin(settings.shutdownTime);
	const now = new Date();
	const isToday = date === localDate(now);
	const fromMin = isToday
		? Math.max(startMin, now.getHours() * 60 + now.getMinutes())
		: startMin;

	const meetings = await db.query.timeBlocks.findMany({
		where: and(eq(timeBlocks.date, date), eq(timeBlocks.kind, "meeting")),
	});
	// Merge overlaps so a calendar meeting also added by hand isn't counted twice.
	let meetingMin = 0;
	let reached = fromMin;
	for (const m of [...meetings].sort((a, b) => a.startMin - b.startMin)) {
		const s = Math.max(reached, m.startMin);
		const e = Math.min(endMin, m.startMin + m.durationMin);
		if (e > s) meetingMin += e - s;
		reached = Math.max(reached, e);
	}

	const availableMin = Math.max(0, endMin - fromMin - meetingMin);
	return {
		plannedMin: Math.round(plannedMin),
		adjustedMin: Math.round(adjustedMin),
		availableMin,
		multiplier: overall.value,
		overloaded: adjustedMin > availableMin,
	};
}

export async function projectNames() {
	return (
		await db.query.projects.findMany({ where: eq(projects.status, "active") })
	).map((p) => ({
		id: p.id,
		name: p.name,
	}));
}
