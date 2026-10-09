/**
 * UI checks for the insights features, driving the real React app in headless Chrome
 * against a TEST API and database (never your real data). See e2e/README.md.
 */
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const UI = process.env.DEEP_E2E_UI;
const API = process.env.DEEP_E2E_API ?? "http://127.0.0.1:4050";
const OUT = process.env.DEEP_E2E_OUT ?? resolve(import.meta.dir, "out");
const TOKEN = process.env.DEEP_TOKEN ?? "";
const CHROME =
	process.env.DEEP_E2E_CHROME ??
	resolve(
		import.meta.dir,
		"../../../video/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe",
	);
const run = UI ? describe : describe.skip;

let browser: Browser;
let page: Page;

async function api<T>(path: string): Promise<T> {
	const res = await fetch(`${API}/api${path}`, {
		headers: { "X-Deep-Token": TOKEN },
	});
	return (await res.json()) as T;
}

async function open(view: string, extra = "") {
	await page.goto(`${UI}/?view=${view}${extra}`, { waitUntil: "networkidle0" });
}

/** Wait until the visible page text contains `t` (case-insensitive). */
async function waitForText(t: string, timeout = 20_000) {
	await page.waitForFunction(
		(s) => document.body.innerText.toLowerCase().includes(s),
		{ timeout },
		t.toLowerCase(),
	);
}

/** Click the enabled button whose label is exactly `label` (icons and key hints ignored). */
async function click(label: string) {
	const handle = await page.waitForFunction(
		(l) =>
			[...document.querySelectorAll("button")].find((b) => {
				const t = (b as HTMLElement).innerText.trim();
				return (
					!(b as HTMLButtonElement).disabled &&
					(t === l || t.startsWith(`${l}\n`))
				);
			}),
		{ timeout: 15_000 },
		label,
	);
	await (handle as unknown as { click: () => Promise<void> }).click();
}

/** Text of the toast that appears after an action. */
async function nextToast(previous = ""): Promise<string> {
	const h = await page.waitForFunction(
		(prev) => {
			const el = document.querySelector("div.fixed.bottom-5");
			const t = el?.textContent ?? "";
			return t && t !== prev ? t : null;
		},
		{ timeout: 20_000 },
		previous,
	);
	return (await h.jsonValue()) as string;
}

async function shot(name: string) {
	await new Promise((r) => setTimeout(r, 350)); // let pop-in animations settle
	await page.screenshot({ path: join(OUT, `${name}.png`) });
}

async function bodyText() {
	return (await page.evaluate(() => document.body.innerText)).toLowerCase();
}

run("insights UI", () => {
	beforeAll(async () => {
		mkdirSync(OUT, { recursive: true });
		browser = await puppeteer.launch({
			executablePath: CHROME,
			headless: true,
		});
		page = await browser.newPage();
		await page.setViewport({ width: 1320, height: 860 });
	});
	afterEach(async () => {
		await page
			?.screenshot({ path: join(OUT, `last-${Date.now()}.png`) })
			.catch(() => {});
	});
	afterAll(async () => {
		await browser?.close();
	});

	test("week dashboard shows days, targets, heatmap and distractions", async () => {
		await open("stats", "&tab=week");
		await waitForText("Focus by day");
		const body = await bodyText();
		for (const s of [
			"Your week",
			"Days on target",
			"Projects vs weekly targets",
			"Your best focus hours",
			"When you got pulled away",
			"Best hours:",
		]) {
			expect(body).toContain(s.toLowerCase());
		}
		for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
			expect(body).toContain(d);
		await shot("01-week");

		const label = await page.$eval(
			"main span.font-mono",
			(el) => el.textContent,
		);
		await page.click('button[aria-label="Previous week"]');
		await page.waitForFunction(
			(l) => document.querySelector("main span.font-mono")?.textContent !== l,
			{},
			label,
		);
		expect(await bodyText()).toContain("this week");
		await shot("02-last-week");
	}, 60_000);

	test("weekly review: reflect, summary, budgets, finish", async () => {
		await open("review");
		await waitForText("Focus by day");
		await shot("03-review-week");
		await click("Next");

		await page.waitForSelector("textarea");
		expect(await page.$$eval("textarea", (t) => t.length)).toBe(3);
		await page.type(
			"label:nth-of-type(1) textarea",
			"Mornings stayed protected",
		);
		await page.type(
			"label:nth-of-type(2) textarea",
			"Phone in another room after lunch",
		);
		await page.type("label:nth-of-type(3) textarea", "Ship the Cloudlyte hero");
		await click("Next");

		await waitForText("Your week");
		await page.waitForFunction(
			() => !document.body.innerText.includes("Reading your week"),
			{ timeout: 60_000 },
		);
		const summary = await page.$eval(
			"main section p",
			(el) => el.textContent ?? "",
		);
		expect(summary.length).toBeGreaterThan(40);
		await shot("04-review-summary");
		await click("Next");

		const smp = 'input[aria-label="SMP hours per week"]';
		await page.waitForSelector(smp);
		// Replace the existing value; a decimal must survive typing ("7." on the way to "7.5").
		await page.focus(smp);
		await page.keyboard.down("Control");
		await page.keyboard.press("KeyA");
		await page.keyboard.up("Control");
		await page.keyboard.press("Backspace");
		await page.type(smp, "7.5");
		expect(await page.$eval(smp, (el) => (el as HTMLInputElement).value)).toBe(
			"7.5",
		);
		await shot("05-review-budgets");
		await click("Finish review");
		await waitForText("Week reviewed");
		await shot("06-review-done");

		const projects =
			await api<{ name: string; weeklyTargetMin: number | null }[]>(
				"/projects",
			);
		expect(projects.find((p) => p.name === "SMP")!.weeklyTargetMin).toBe(450);
		expect((await api<{ done: boolean }>("/reviews/weekly/pending")).done).toBe(
			true,
		);
	}, 120_000);

	test("find projects imports a repo", async () => {
		await open("projects");
		await click("Find projects");
		await page.waitForSelector('input[type="checkbox"]');
		await shot("07-find-projects");
		const before = (await api<unknown[]>("/projects")).length;
		await page.click('input[type="checkbox"]');
		await click("Add 1 project");
		expect(await nextToast()).toContain("Added 1 project");
		expect((await api<unknown[]>("/projects")).length).toBe(before + 1);
	}, 60_000);

	test("timesheet previews billable time and exports CSV and PDF", async () => {
		await open("projects");
		await click("Timesheets");
		await page.waitForSelector("table tbody tr td");
		await click("This month");
		await page.waitForFunction(
			() => document.querySelectorAll("table tbody tr").length > 1,
		);
		expect(
			await page.$$eval("table tbody tr", (r) => r.length),
		).toBeGreaterThan(1);
		await shot("08-timesheet");

		const dir = join(OUT, "exports");
		mkdirSync(dir, { recursive: true });
		await page.type('input[aria-label="Save to folder"]', dir);
		await click("CSV");
		const t1 = await nextToast();
		expect(t1).toContain(".csv");
		await click("PDF");
		expect(await nextToast(t1)).toContain(".pdf");
		const files = readdirSync(dir);
		expect(files.some((f) => f.endsWith(".csv"))).toBe(true);
		expect(files.some((f) => f.endsWith(".pdf"))).toBe(true);
	}, 60_000);

	test("settings: back up now", async () => {
		await open("settings");
		await waitForText("Daily database backup");
		await click("Back up now");
		expect(await nextToast()).toContain("Backed up to");
		const list = await api<{ path: string }[]>("/backups");
		expect(list.length).toBeGreaterThan(0);
		expect(existsSync(list[0]!.path)).toBe(true);
		await page.evaluate(() => {
			for (const el of document.querySelectorAll("main .overflow-y-auto"))
				el.scrollTo(0, 99999);
		});
		await shot("09-settings-backups");
	}, 60_000);

	test("today timeline marks your commits", async () => {
		const commits = await api<unknown[]>(
			`/day/${new Date().toLocaleDateString("en-CA")}/commits`,
		);
		await open("today");
		await waitForText("Drag tasks here");
		await page.waitForFunction(
			(n) =>
				document.querySelectorAll('div.rotate-45[title*=" · "]').length === n,
			{ timeout: 10_000 },
			commits.length,
		);
		await shot("10-today-commits");
	}, 60_000);

	test("leftovers flag a task that keeps slipping", async () => {
		await open("startday");
		await waitForText("Moved 2 times already");
		await shot("11-leftovers-prompt");
		await click("Make it smaller");
		await waitForText("Replace with");
		await page.waitForFunction(
			() => !document.body.innerText.includes("Breaking it down"),
			{ timeout: 60_000 },
		);
		await shot("12-leftovers-split");
	}, 120_000);
});
