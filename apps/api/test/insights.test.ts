import { describe, expect, test } from "bun:test";
import { addDays, mondayOf } from "@deep/shared";
import {
	heatmap,
	type SessionLite,
	timesheet,
	timesheetCsv,
	weekStats,
} from "../src/lib/insights-core";

/** Local time ISO string, so tests behave the same in any timezone. */
const at = (date: string, hhmm: string) =>
	new Date(`${date}T${hhmm}:00`).toISOString();

const MON = "2026-10-05";
const projects = [
	{ id: 1, name: "SMP", color: "#3987e5", weeklyTargetMin: 600 },
	{
		id: 2,
		name: "Cloudlyte",
		color: "#d95926",
		billable: true,
		hourlyRate: 45,
		client: "Cloudlyte",
	},
	{ id: 3, name: "Agri-ledger", color: "#199e70", weeklyTargetMin: 120 },
];
const tasks = [
	{ id: 10, title: "Webhook", energy: "deep" },
	{ id: 11, title: "Hero section", energy: "deep" },
	{ id: 12, title: "Invoice reply", energy: "shallow" },
];

let nextId = 1;
const session = (
	date: string,
	start: string,
	minutes: number,
	projectId: number | null,
	taskId: number | null,
	extra: Partial<SessionLite> = {},
): SessionLite => {
	const startedAt = at(date, start);
	return {
		id: nextId++,
		kind: "focus",
		projectId,
		taskId,
		startedAt,
		endedAt: new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
		activeSec: minutes * 60,
		...extra,
	};
};

describe("dates", () => {
	test("mondayOf finds the Monday of the week", () => {
		expect(mondayOf("2026-10-05")).toBe("2026-10-05");
		expect(mondayOf("2026-10-08")).toBe("2026-10-05");
		expect(mondayOf("2026-10-11")).toBe("2026-10-05");
		expect(mondayOf("2026-10-12")).toBe("2026-10-12");
	});
	test("addDays crosses month ends", () => {
		expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
	});
});

describe("weekStats", () => {
	const sessions = [
		session(MON, "09:00", 50, 1, 10),
		session(MON, "10:00", 50, 2, 11),
		session(MON, "11:00", 30, 1, 10),
		session(addDays(MON, 2), "09:00", 90, 1, 10),
		session(addDays(MON, 2), "14:00", 20, 3, 12),
		// Outside the week: must be ignored.
		session(addDays(MON, 7), "09:00", 60, 1, 10),
		// Breaks don't count.
		{ ...session(MON, "12:00", 10, null, null), kind: "break" },
	];
	const stats = weekStats({
		start: MON,
		sessions,
		projects,
		tasks,
		tasksDone: 4,
		captures: [
			{ kind: "urge", text: "Urge", createdAt: at(MON, "09:20") },
			{ kind: "urge", text: "WhatsApp", createdAt: at(MON, "09:40") },
			{
				kind: "urge",
				text: "WhatsApp",
				createdAt: at(addDays(MON, 2), "09:10"),
			},
			{
				kind: "interruption",
				text: "Interruption",
				createdAt: at(MON, "15:05"),
			},
			{ kind: "parking", text: "idea", createdAt: at(MON, "10:00") },
		],
		dailyTargetMin: 120,
	});

	test("totals only this week's focus sessions", () => {
		expect(stats.focusSec).toBe((50 + 50 + 30 + 90 + 20) * 60);
		expect(stats.sessions).toBe(5);
		expect(stats.end).toBe("2026-10-11");
		expect(stats.targetSec).toBe(120 * 60 * 5);
	});

	test("splits time per day and per project", () => {
		expect(stats.days).toHaveLength(7);
		expect(stats.days[0]!.focusSec).toBe(130 * 60);
		expect(stats.days[1]!.focusSec).toBe(0);
		expect(stats.days[2]!.perProject[0]).toMatchObject({
			name: "SMP",
			sec: 90 * 60,
		});
		const smp = stats.perProject.find((p) => p.projectId === 1)!;
		expect(smp.sec).toBe(170 * 60);
		expect(smp.targetMin).toBe(600);
	});

	test("counts days on target, switches and the longest session", () => {
		// Monday 130 min ≥ 120; Wednesday 110 min < 120.
		expect(stats.daysOnTarget).toBe(1);
		// Monday: SMP → Cloudlyte → SMP = 2 switches; Wednesday: 1. Two active days.
		expect(stats.switchesPerDay).toBe(1.5);
		expect(stats.longestSessionSec).toBe(90 * 60);
	});

	test("groups time by task energy", () => {
		expect(stats.energy.deep).toBe((50 + 50 + 30 + 90) * 60);
		expect(stats.energy.shallow).toBe(20 * 60);
	});

	test("summarises distractions, ignoring default texts and parking-lot notes", () => {
		expect(stats.urges).toBe(3);
		expect(stats.interruptions).toBe(1);
		expect(stats.distractionsByHour[9]).toBe(3);
		expect(stats.distractionsByHour[15]).toBe(1);
		expect(stats.topDistractions).toEqual([{ text: "WhatsApp", count: 2 }]);
	});
});

describe("heatmap", () => {
	test("spreads a session across the hours it spans", () => {
		// 09:30–10:30 → 30 min in the 9 o'clock slot, 30 in the 10 o'clock slot.
		const h = heatmap(
			[session(MON, "09:30", 60, 1, 10, { focusRating: 4 })],
			4,
		);
		const nine = h.cells.find((c) => c.dow === 0 && c.hour === 9)!;
		const ten = h.cells.find((c) => c.dow === 0 && c.hour === 10)!;
		expect(nine.focusSec).toBe(30 * 60);
		expect(ten.focusSec).toBe(30 * 60);
		expect(nine.avgRating).toBe(4);
	});

	test("scales by active time when a session had pauses", () => {
		// 60 min of wall time but only 30 min active.
		const s = session(MON, "09:00", 60, 1, 10);
		s.activeSec = 30 * 60;
		const h = heatmap([s], 1);
		expect(h.cells[0]!.focusSec).toBe(30 * 60);
	});

	test("averages ratings and picks the best hours", () => {
		const h = heatmap(
			[
				session(MON, "09:00", 50, 1, 10, { focusRating: 5 }),
				session(addDays(MON, 1), "09:05", 50, 1, 10, { focusRating: 3 }),
				session(MON, "14:00", 20, 1, 10),
				session(MON, "16:00", 40, 1, 10),
				session(MON, "11:00", 45, 1, 10),
			],
			4,
		);
		const mon9 = h.cells.find((c) => c.dow === 0 && c.hour === 9)!;
		expect(mon9.avgRating).toBe(5);
		expect(h.bestHours).toEqual([9, 11, 16]);
	});
});

describe("timesheet", () => {
	const sessions = [
		session(MON, "09:00", 50, 2, 11),
		session(MON, "11:00", 40, 2, 11),
		session(MON, "14:00", 30, 1, 10),
		session(addDays(MON, 1), "09:00", 45, 2, null),
		// Still running: excluded.
		{ ...session(addDays(MON, 1), "13:00", 20, 2, 11), endedAt: null },
		// Outside the range.
		session(addDays(MON, 9), "09:00", 60, 2, 11),
	];
	const ts = timesheet({
		from: MON,
		to: addDays(MON, 6),
		sessions,
		projects,
		tasks,
	});

	test("groups by day, project and task", () => {
		expect(ts.rows).toHaveLength(3);
		expect(ts.rows[0]).toMatchObject({
			date: MON,
			project: "Cloudlyte",
			task: "Hero section",
			minutes: 90,
		});
		expect(ts.rows[2]).toMatchObject({ task: "General work", minutes: 45 });
		expect(ts.totalMinutes).toBe(90 + 30 + 45);
	});

	test("prices only billable projects", () => {
		expect(ts.rows[0]!.amount).toBe(67.5);
		expect(ts.rows.find((r) => r.project === "SMP")!.amount).toBeNull();
		expect(ts.totalAmount).toBe(67.5 + 33.75);
	});

	test("exports CSV with decimal hours and escaped text", () => {
		const csv = timesheetCsv({
			...ts,
			rows: [{ ...ts.rows[0]!, task: 'Hero, "v2"' }],
			totalMinutes: 90,
			totalAmount: 67.5,
		});
		const lines = csv.trim().split("\r\n");
		expect(lines[0]).toBe("Date,Project,Client,Task,Hours,Rate,Amount");
		expect(lines[1]).toBe(
			`${MON},Cloudlyte,Cloudlyte,"Hero, ""v2""",1.50,45,67.50`,
		);
		expect(lines[2]).toBe("Total,,,,1.50,,67.50");
	});
});
