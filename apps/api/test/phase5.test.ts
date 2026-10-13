import { describe, expect, test } from "bun:test";
import { isDomain } from "../src/lib/browser";
import { toDayBlocks } from "../src/lib/calendar";
import { type SpanLite, summarizeUsage } from "../src/lib/usage-core";

const local = (d: string, hhmm: string) =>
	new Date(`${d}T${hhmm}:00`).toISOString();

describe("calendar meetings become day blocks", () => {
	const base = {
		uid: "a",
		title: "Standup",
		allDay: false,
		location: null,
		url: null,
	};

	test("a morning meeting is one block in local minutes", () => {
		const blocks = toDayBlocks(
			{
				...base,
				start: local("2026-10-13", "09:30"),
				end: local("2026-10-13", "09:45"),
			},
			"2026-10-12",
			"2026-10-20",
		);
		expect(blocks).toEqual([
			{ date: "2026-10-13", startMin: 570, durationMin: 15 },
		]);
	});

	test("a meeting over midnight is split across both days", () => {
		const blocks = toDayBlocks(
			{
				...base,
				start: local("2026-10-13", "23:00"),
				end: local("2026-10-14", "01:00"),
			},
			"2026-10-12",
			"2026-10-20",
		);
		expect(blocks).toEqual([
			{ date: "2026-10-13", startMin: 1380, durationMin: 60 },
			{ date: "2026-10-14", startMin: 0, durationMin: 60 },
		]);
	});

	test("parts outside the window are dropped, tiny meetings get 5 minutes", () => {
		expect(
			toDayBlocks(
				{
					...base,
					start: local("2026-10-30", "10:00"),
					end: local("2026-10-30", "11:00"),
				},
				"2026-10-12",
				"2026-10-20",
			),
		).toEqual([]);
		expect(
			toDayBlocks(
				{
					...base,
					start: local("2026-10-13", "10:00"),
					end: local("2026-10-13", "10:02"),
				},
				"2026-10-12",
				"2026-10-20",
			)[0]?.durationMin,
		).toBe(5);
	});
});

describe("distracting list entries", () => {
	test("domains are blocked, app keywords are not", () => {
		expect(isDomain("youtube.com")).toBe(true);
		expect(isDomain("news.ycombinator.com")).toBe(true);
		expect(isDomain("*.reddit.com")).toBe(true);
		expect(isDomain("steam")).toBe(false);
		expect(isDomain("spotify")).toBe(false);
		expect(isDomain("youtube.com/watch")).toBe(false);
	});
});

describe("app usage summary", () => {
	const at = (m: number) =>
		new Date(Date.UTC(2026, 9, 13, 8, 0) + m * 60_000).toISOString();
	const span = (
		app: string,
		site: string | null,
		category: string,
		startMin: number,
		sec: number,
		sessionId: number | null,
	): SpanLite => ({
		app,
		site,
		category,
		startedAt: at(startMin),
		sec,
		sessionId,
	});

	const spans = [
		span("VS Code", null, "work", 0, 1200, 1),
		span("Chrome", "youtube.com", "distraction", 20, 180, 1),
		span("VS Code", null, "work", 23, 1500, 1),
		span("Chrome", "github.com", "work", 48, 300, 1),
		span("WhatsApp", null, "comms", 53, 600, null),
		span("Chrome", "youtube.com", "distraction", 63, 900, null),
	];
	const u = summarizeUsage("2026-10-13", spans);

	test("totals by category and item", () => {
		expect(u.totalSec).toBe(4680);
		expect(u.byCategory).toEqual({
			work: 3000,
			comms: 600,
			distraction: 1080,
			other: 0,
		});
		expect(u.items[0]).toMatchObject({ label: "VS Code", sec: 2700 });
		expect(u.items.find((i) => i.label === "youtube.com")).toMatchObject({
			sec: 1080,
			focusSec: 180,
			category: "distraction",
		});
	});

	test("focus quality: off-task time, switches and the longest work stretch", () => {
		expect(u.focusSec).toBe(3180);
		expect(u.offTaskSec).toBe(180);
		// VS Code → YouTube → VS Code → GitHub
		expect(u.switchesPerHour).toBeCloseTo(3 / (3180 / 3600), 0);
		// The YouTube detour breaks the run: 1500 + 300 after it.
		expect(u.longestWorkSec).toBe(1800);
	});

	test("an empty day", () => {
		const empty = summarizeUsage("2026-10-13", []);
		expect(empty.totalSec).toBe(0);
		expect(empty.items).toEqual([]);
		expect(empty.switchesPerHour).toBeNull();
	});
});
