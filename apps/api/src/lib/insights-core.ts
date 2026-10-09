/**
 * Pure calculations behind the weekly dashboard, heatmap and timesheets.
 * No database access here, so they can be unit-tested (see test/insights.test.ts).
 */
import {
	addDays,
	type Energy,
	type HeatCell,
	type Heatmap,
	localDate,
	type Timesheet,
	type TimesheetRow,
	type WeekStats,
} from "@deep/shared";

export interface SessionLite {
	id: number;
	kind: string;
	projectId: number | null;
	taskId: number | null;
	startedAt: string;
	endedAt: string | null;
	/** Active (non-paused) seconds; for a running session, the time so far. */
	activeSec: number;
	focusRating?: number | null;
}

export interface ProjectLite {
	id: number;
	name: string;
	color: string;
	client?: string | null;
	billable?: boolean;
	hourlyRate?: number | null;
	weeklyTargetMin?: number | null;
}

export interface TaskLite {
	id: number;
	title: string;
	energy: string | null;
}

export interface CaptureLite {
	kind: string;
	text: string;
	createdAt: string;
}

const NO_PROJECT = { name: "No project", color: "#6f6a78" };
const DEFAULT_TEXTS = new Set(["urge", "interruption"]);

const dayOf = (iso: string) => localDate(new Date(iso));

export function weekStats(input: {
	start: string;
	sessions: SessionLite[];
	projects: ProjectLite[];
	tasks: TaskLite[];
	tasksDone: number;
	captures: CaptureLite[];
	dailyTargetMin: number;
}): WeekStats {
	const { start } = input;
	const end = addDays(start, 6);
	const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
	const projectById = new Map(input.projects.map((p) => [p.id, p]));
	const taskById = new Map(input.tasks.map((t) => [t.id, t]));
	const focus = input.sessions
		.filter((s) => s.kind === "focus")
		.filter((s) => dates.includes(dayOf(s.startedAt)))
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

	const ref = (projectId: number | null) => {
		const p = projectId ? projectById.get(projectId) : undefined;
		return {
			projectId,
			name: p?.name ?? NO_PROJECT.name,
			color: p?.color ?? NO_PROJECT.color,
		};
	};

	const perDay = new Map<string, Map<number | null, number>>(
		dates.map((d) => [d, new Map()]),
	);
	const perProject = new Map<number | null, number>();
	const energy: Record<Energy | "none", number> = {
		deep: 0,
		shallow: 0,
		admin: 0,
		none: 0,
	};
	const switchesByDay = new Map<string, number>();
	const lastProjectByDay = new Map<string, number | null>();
	let longest = 0;

	for (const s of focus) {
		const day = dayOf(s.startedAt);
		const bucket = perDay.get(day)!;
		bucket.set(s.projectId, (bucket.get(s.projectId) ?? 0) + s.activeSec);
		perProject.set(
			s.projectId,
			(perProject.get(s.projectId) ?? 0) + s.activeSec,
		);
		const e = (s.taskId ? taskById.get(s.taskId)?.energy : null) as
			| Energy
			| null
			| undefined;
		energy[e ?? "none"] += s.activeSec;
		longest = Math.max(longest, s.activeSec);
		if (
			lastProjectByDay.has(day) &&
			lastProjectByDay.get(day) !== s.projectId
		) {
			switchesByDay.set(day, (switchesByDay.get(day) ?? 0) + 1);
		}
		lastProjectByDay.set(day, s.projectId);
	}

	const days = dates.map((date) => {
		const bucket = perDay.get(date)!;
		const projects = [...bucket.entries()]
			.map(([pid, sec]) => ({ ...ref(pid), sec }))
			.filter((p) => p.sec > 0)
			.sort((a, b) => b.sec - a.sec);
		return {
			date,
			focusSec: projects.reduce((a, p) => a + p.sec, 0),
			perProject: projects,
		};
	});

	const activeDays = days.filter((d) => d.focusSec > 0).length;
	const targetSec = input.dailyTargetMin * 60;

	const distractions = input.captures.filter(
		(c) =>
			(c.kind === "urge" || c.kind === "interruption") &&
			dates.includes(dayOf(c.createdAt)),
	);
	const byHour = Array.from({ length: 24 }, () => 0);
	const texts = new Map<string, number>();
	for (const c of distractions) {
		byHour[new Date(c.createdAt).getHours()]!++;
		const t = c.text.trim();
		if (t && !DEFAULT_TEXTS.has(t.toLowerCase()))
			texts.set(t, (texts.get(t) ?? 0) + 1);
	}

	// Every project with a target shows up, even with no time logged yet.
	for (const p of input.projects)
		if (p.weeklyTargetMin && !perProject.has(p.id)) perProject.set(p.id, 0);

	return {
		start,
		end,
		focusSec: days.reduce((a, d) => a + d.focusSec, 0),
		targetSec: targetSec * 5,
		sessions: focus.length,
		tasksDone: input.tasksDone,
		urges: distractions.filter((c) => c.kind === "urge").length,
		interruptions: distractions.filter((c) => c.kind === "interruption").length,
		switchesPerDay:
			activeDays === 0
				? 0
				: Math.round(
						([...switchesByDay.values()].reduce((a, n) => a + n, 0) /
							activeDays) *
							10,
					) / 10,
		longestSessionSec: longest,
		daysOnTarget: days.filter((d) => d.focusSec >= targetSec).length,
		days,
		perProject: [...perProject.entries()]
			.map(([pid, sec]) => ({
				...ref(pid),
				sec,
				targetMin: pid ? (projectById.get(pid)?.weeklyTargetMin ?? null) : null,
			}))
			.sort((a, b) => b.sec - a.sec),
		energy,
		distractionsByHour: byHour,
		topDistractions: [...texts.entries()]
			.map(([text, count]) => ({ text, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5),
	};
}

/**
 * Focus time by weekday and hour. A session's active time is spread over the
 * clock hours it spans, in proportion to wall-clock overlap.
 */
export function heatmap(sessions: SessionLite[], weeks: number): Heatmap {
	const cells = new Map<
		string,
		{ sec: number; ratingSum: number; rated: number; ids: Set<number> }
	>();
	const cell = (dow: number, hour: number) => {
		const key = `${dow}:${hour}`;
		let c = cells.get(key);
		if (!c) {
			c = { sec: 0, ratingSum: 0, rated: 0, ids: new Set() };
			cells.set(key, c);
		}
		return c;
	};

	for (const s of sessions) {
		if (s.kind !== "focus" || s.activeSec <= 0) continue;
		const start = Date.parse(s.startedAt);
		const end = s.endedAt ? Date.parse(s.endedAt) : start + s.activeSec * 1000;
		const wall = Math.max(1, end - start);
		let t = start;
		while (t < end) {
			const d = new Date(t);
			const next = new Date(d);
			next.setMinutes(60, 0, 0);
			const sliceEnd = Math.min(end, next.getTime());
			const share = (sliceEnd - t) / wall;
			const c = cell((d.getDay() + 6) % 7, d.getHours());
			c.sec += s.activeSec * share;
			if (!c.ids.has(s.id)) {
				c.ids.add(s.id);
				if (s.focusRating) {
					c.ratingSum += s.focusRating;
					c.rated++;
				}
			}
			t = sliceEnd;
		}
	}

	const out: HeatCell[] = [...cells.entries()].map(([key, c]) => {
		const [dow, hour] = key.split(":").map(Number) as [number, number];
		return {
			dow,
			hour,
			focusSec: Math.round(c.sec),
			avgRating: c.rated ? Math.round((c.ratingSum / c.rated) * 10) / 10 : null,
			sessions: c.ids.size,
		};
	});

	const byHour = new Map<number, number>();
	for (const c of out)
		byHour.set(c.hour, (byHour.get(c.hour) ?? 0) + c.focusSec);
	const bestHours = [...byHour.entries()]
		.filter(([, sec]) => sec > 0)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([h]) => h)
		.sort((a, b) => a - b);

	return {
		weeks,
		cells: out.sort((a, b) => a.dow - b.dow || a.hour - b.hour),
		bestHours,
	};
}

/** One row per day, project and task, for focus time between from and to (inclusive). */
export function timesheet(input: {
	from: string;
	to: string;
	sessions: SessionLite[];
	projects: ProjectLite[];
	tasks: TaskLite[];
}): Timesheet {
	const projectById = new Map(input.projects.map((p) => [p.id, p]));
	const taskById = new Map(input.tasks.map((t) => [t.id, t]));
	const groups = new Map<string, TimesheetRow & { sec: number }>();

	for (const s of input.sessions) {
		if (s.kind !== "focus" || !s.endedAt) continue;
		const date = dayOf(s.startedAt);
		if (date < input.from || date > input.to) continue;
		const p = s.projectId ? projectById.get(s.projectId) : undefined;
		const task = s.taskId
			? (taskById.get(s.taskId)?.title ?? "Untitled task")
			: "General work";
		const key = `${date}|${s.projectId}|${task}`;
		const rate = p?.billable && p.hourlyRate ? p.hourlyRate : null;
		const row = groups.get(key) ?? {
			date,
			projectId: s.projectId,
			project: p?.name ?? NO_PROJECT.name,
			client: p?.client ?? null,
			task,
			minutes: 0,
			rate,
			amount: null,
			sec: 0,
		};
		row.sec += s.activeSec;
		groups.set(key, row);
	}

	const rows: TimesheetRow[] = [...groups.values()]
		.map(({ sec, ...r }) => {
			const minutes = Math.round(sec / 60);
			return {
				...r,
				minutes,
				amount: r.rate ? Math.round((minutes / 60) * r.rate * 100) / 100 : null,
			};
		})
		.filter((r) => r.minutes > 0)
		.sort(
			(a, b) =>
				a.date.localeCompare(b.date) ||
				a.project.localeCompare(b.project) ||
				a.task.localeCompare(b.task),
		);

	const amounts = rows.filter((r) => r.amount !== null);
	return {
		from: input.from,
		to: input.to,
		rows,
		totalMinutes: rows.reduce((a, r) => a + r.minutes, 0),
		totalAmount: amounts.length
			? Math.round(amounts.reduce((a, r) => a + r.amount!, 0) * 100) / 100
			: null,
	};
}

/** RFC 4180 CSV with hours as decimals (what invoicing tools expect). */
export function timesheetCsv(t: Timesheet): string {
	const cell = (v: string | number | null) => {
		const s = v === null ? "" : String(v);
		return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const lines = [
		["Date", "Project", "Client", "Task", "Hours", "Rate", "Amount"].join(","),
	];
	for (const r of t.rows) {
		lines.push(
			[
				r.date,
				r.project,
				r.client,
				r.task,
				(r.minutes / 60).toFixed(2),
				r.rate,
				r.amount?.toFixed(2) ?? null,
			]
				.map(cell)
				.join(","),
		);
	}
	lines.push(
		[
			"Total",
			"",
			"",
			"",
			(t.totalMinutes / 60).toFixed(2),
			"",
			t.totalAmount?.toFixed(2) ?? "",
		]
			.map(cell)
			.join(","),
	);
	return `${lines.join("\r\n")}\r\n`;
}
