/**
 * End-to-end checks for the insights features against a running TEST API.
 *
 *   1. Seed a test database:   DATABASE_URL=…/deep_test bun video/scripts/seed-demo.ts active
 *   2. Start a test API:       DATABASE_URL=…/deep_test API_PORT=4050 DEEP_TEST=1 bun --env-file=.env apps/api/src/index.ts
 *   3. Run:                    DEEP_E2E_API=http://127.0.0.1:4050 bun test test/phase4.e2e.test.ts
 *
 * Skipped unless DEEP_E2E_API is set, so `bun test` never touches real data.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addDays,
	type DiscoveredProject,
	type Heatmap,
	localDate,
	mondayOf,
	type Project,
	type Timesheet,
	type WeeklyReview,
	type WeekStats,
} from "@deep/shared";

const API = process.env.DEEP_E2E_API;
const TOKEN = process.env.DEEP_TOKEN ?? "";
const run = API ? describe : describe.skip;

async function call<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	const res = await fetch(`${API}/api${path}`, {
		method,
		headers: { "X-Deep-Token": TOKEN, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const json = await res.json();
	if (!res.ok)
		throw new Error(
			`${method} ${path} → ${res.status} ${JSON.stringify(json)}`,
		);
	return json as T;
}

const today = localDate();
const thisMonday = mondayOf(today);
const lastMonday = addDays(thisMonday, -7);

run("weekly dashboard", () => {
	test("this week includes today's sessions and project targets", async () => {
		const w = await call<WeekStats>("GET", `/stats/week?date=${today}`);
		expect(w.start).toBe(thisMonday);
		expect(w.days).toHaveLength(7);
		expect(w.focusSec).toBeGreaterThan(0);
		const smp = w.perProject.find((p) => p.name === "SMP");
		expect(smp?.targetMin).toBe(720);
		expect(w.days.reduce((a, d) => a + d.focusSec, 0)).toBe(w.focusSec);
	});

	test("last week has history with energy split and distractions", async () => {
		const w = await call<WeekStats>("GET", `/stats/week?date=${lastMonday}`);
		expect(w.sessions).toBeGreaterThan(5);
		expect(w.energy.deep).toBeGreaterThan(w.energy.admin);
		expect(w.urges + w.interruptions).toBeGreaterThan(0);
		expect(w.distractionsByHour.reduce((a, n) => a + n, 0)).toBe(
			w.urges + w.interruptions,
		);
	});

	test("heatmap finds the strong morning hours", async () => {
		const h = await call<Heatmap>("GET", "/stats/heatmap?weeks=4");
		expect(h.cells.length).toBeGreaterThan(10);
		expect(h.bestHours).toHaveLength(3);
		expect(h.bestHours.some((x) => x === 8 || x === 9)).toBe(true);
		const rated = h.cells.filter((c) => c.avgRating !== null);
		expect(rated.length).toBeGreaterThan(0);
	});
});

run("weekly review", () => {
	test("last week is pending until completed, and budgets apply on completion", async () => {
		const pending = await call<{ start: string; done: boolean }>(
			"GET",
			"/reviews/weekly/pending",
		);
		expect(pending.start).toBe(lastMonday);

		const projects = await call<Project[]>("GET", "/projects");
		const smp = projects.find((p) => p.name === "SMP")!;
		const saved = await call<WeeklyReview>(
			"PUT",
			`/reviews/weekly/${lastMonday}`,
			{
				data: {
					wentWell: "Mornings were protected",
					change: "Phone away after lunch",
					budgets: { [smp.id]: 900 },
				},
			},
		);
		expect(saved.data.wentWell).toBe("Mornings were protected");

		const sum = await call<{ summary: string }>(
			"POST",
			`/reviews/weekly/${lastMonday}/summary`,
		);
		expect(sum.summary.length).toBeGreaterThan(40);

		const done = await call<WeeklyReview>(
			"POST",
			`/reviews/weekly/${lastMonday}/complete`,
		);
		expect(done.completedAt).not.toBeNull();
		expect(done.aiSummary).toBe(sum.summary);
		const after = await call<Project[]>("GET", "/projects");
		expect(after.find((p) => p.id === smp.id)!.weeklyTargetMin).toBe(900);
		expect(
			(await call<{ done: boolean }>("GET", "/reviews/weekly/pending")).done,
		).toBe(true);
	}, 60_000);
});

run("timesheets", () => {
	const dir = mkdtempSync(join(tmpdir(), "deep-ts-"));

	test("previews billable time with amounts", async () => {
		const t = await call<Timesheet>(
			"GET",
			`/timesheet?from=${addDays(today, -27)}&to=${today}`,
		);
		expect(t.rows.length).toBeGreaterThan(0);
		expect(
			t.rows.every(
				(r) => r.project === "Cloudlyte" || r.project === "Agri-ledger",
			),
		).toBe(true);
		expect(t.totalAmount).toBeGreaterThan(0);
		expect(t.totalMinutes).toBe(t.rows.reduce((a, r) => a + r.minutes, 0));
	});

	test("writes CSV and PDF files", async () => {
		const projects = await call<Project[]>("GET", "/projects");
		const cloud = projects.find((p) => p.name === "Cloudlyte")!;
		const range = { projectId: cloud.id, from: addDays(today, -27), to: today };
		const csvPath = join(dir, "cloudlyte.csv");
		const pdfPath = join(dir, "cloudlyte.pdf");
		const r1 = await call<{ rows: number }>("POST", "/timesheet", {
			...range,
			format: "csv",
			path: csvPath,
		});
		const r2 = await call<{ rows: number }>("POST", "/timesheet", {
			...range,
			format: "pdf",
			path: pdfPath,
		});
		expect(r1.rows).toBeGreaterThan(0);
		expect(
			readFileSync(csvPath, "utf8").startsWith(
				"Date,Project,Client,Task,Hours,Rate,Amount",
			),
		).toBe(true);
		expect(readFileSync(pdfPath).subarray(0, 5).toString()).toBe("%PDF-");
		expect(r2.rows).toBe(r1.rows);
	});

	test("rejects a backwards date range", async () => {
		await expect(
			call("GET", `/timesheet?from=${today}&to=${addDays(today, -3)}`),
		).rejects.toThrow("400");
	});
});

run("project discovery", () => {
	test("finds unlinked repos and imports them", async () => {
		const d = await call<{ root: string; found: DiscoveredProject[] }>(
			"GET",
			"/projects/discover",
		);
		expect(d.found.length).toBeGreaterThan(0);
		// smp is linked by the seed, so it must not be offered again.
		expect(d.found.some((f) => f.name === "smp")).toBe(false);
		const pick =
			d.found.find((f) => f.name === "planner-tracker") ?? d.found[0]!;
		const created = await call<Project[]>("POST", "/projects/import", {
			items: [{ name: pick.name, path: pick.path }],
		});
		expect(created[0]!.paths).toHaveLength(1);
		const again = await call<{ found: DiscoveredProject[] }>(
			"GET",
			"/projects/discover",
		);
		expect(again.found.some((f) => f.path === pick.path)).toBe(false);
	});
});

run("timeline commits", () => {
	test("lists your commits for linked repos", async () => {
		const commits = await call<{ hash: string; at: string }[]>(
			"GET",
			`/day/${today}/commits`,
		);
		expect(Array.isArray(commits)).toBe(true);
		for (const c of commits) {
			expect(c.hash).toHaveLength(8);
			expect(localDate(new Date(c.at))).toBe(today);
		}
	});
});

run("backups", () => {
	test("dumps the database to a gzip file", async () => {
		const b = await call<{ path: string; bytes: number }>("POST", "/backups");
		expect(existsSync(b.path)).toBe(true);
		expect(b.bytes).toBeGreaterThan(1000);
		const gz = readFileSync(b.path);
		expect(gz[0]).toBe(0x1f);
		expect(gz[1]).toBe(0x8b);
		const sql = new TextDecoder().decode(Bun.gunzipSync(gz));
		expect(sql).toContain("CREATE TABLE");
		const list = await call<{ path: string }[]>("GET", "/backups");
		expect(list.some((x) => x.path === b.path)).toBe(true);
	});
});
