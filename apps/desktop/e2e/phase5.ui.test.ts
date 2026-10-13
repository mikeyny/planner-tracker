/**
 * UI checks for Phase 5 (calendar, distractions, browser extension settings, coach),
 * driving the real React app in headless Chrome against a TEST API and database.
 * Expects the "active" demo seed (a focus session on SMP is running).
 */
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type CalendarFeed, minToHhmm, type Settings } from "@deep/shared";
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

// bun test runs in UTC; the app and API use the machine's zone.
if (UI) {
	const health = (await (await fetch(`${API}/health`)).json()) as {
		timeZone?: string;
	};
	if (health.timeZone) process.env.TZ = health.timeZone;
}

let browser: Browser;
let page: Page;
let feedServer: ReturnType<typeof Bun.serve>;

async function api<T>(method: string, path: string, body?: unknown) {
	const res = await fetch(`${API}/api${path}`, {
		method,
		headers: { "X-Deep-Token": TOKEN, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!res.ok)
		throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
	return (await res.json()) as T;
}

async function open(view: string, extra = "") {
	await page.goto(`${UI}/?view=${view}${extra}`, { waitUntil: "networkidle0" });
}

async function waitForText(t: string, timeout = 20_000) {
	await page.waitForFunction(
		(s) => document.body.innerText.toLowerCase().includes(s),
		{ timeout },
		t.toLowerCase(),
	);
}

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

async function shot(name: string) {
	await new Promise((r) => setTimeout(r, 350));
	await page.screenshot({ path: join(OUT, `${name}.png`) });
}

// A client call ~35 minutes from now, so starting a 50-minute session clashes.
const now = new Date();
const callMin = Math.min(
	23 * 60,
	Math.ceil((now.getHours() * 60 + now.getMinutes() + 35) / 5) * 5,
);
const callStart = new Date(now);
callStart.setHours(Math.floor(callMin / 60), callMin % 60, 0, 0);
const stamp = (d: Date) =>
	d
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
const ICS = [
	"BEGIN:VCALENDAR",
	"VERSION:2.0",
	"X-WR-CALNAME:me@example.com",
	"BEGIN:VEVENT",
	"UID:client@example.com",
	`DTSTART:${stamp(callStart)}`,
	`DTEND:${stamp(new Date(callStart.getTime() + 45 * 60_000))}`,
	"SUMMARY:Client call",
	"X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
	"END:VEVENT",
	"END:VCALENDAR",
].join("\r\n");

run("Phase 5 UI", () => {
	beforeAll(async () => {
		mkdirSync(OUT, { recursive: true });
		feedServer = Bun.serve({
			port: 0,
			fetch: () =>
				new Response(ICS, { headers: { "Content-Type": "text/calendar" } }),
		});
		// Forget any extension heartbeat so Settings shows the install steps.
		await api("POST", "/test/browser/reset");
		for (const f of await api<CalendarFeed[]>("GET", "/calendars"))
			await api("DELETE", `/calendars/${f.id}`);
		await api("PUT", "/settings", {
			distracting: ["youtube.com", "x.com"],
			driftNudge: true,
			coachCheckins: "off",
		});
		browser = await puppeteer.launch({
			executablePath: CHROME,
			headless: true,
			args: [
				"--use-fake-ui-for-media-stream",
				"--use-fake-device-for-media-stream",
				"--autoplay-policy=no-user-gesture-required",
			],
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
		feedServer?.stop(true);
	});

	test("settings: distracting list, browser extension and coach", async () => {
		await open("settings");
		await waitForText("Distracting sites and apps");
		const body = await page.evaluate(() => document.body.innerText);
		expect(body).toContain("Block distracting sites during focus");
		expect(body).toContain("Load unpacked");
		expect(body.replaceAll("\\", "/")).toContain("apps/browser");
		expect(body).toContain("Voice check-ins");

		await page.type(
			'input[aria-label="Add a distracting site or app"]',
			"Steam",
		);
		await page.keyboard.press("Enter");
		await page.waitForFunction(() => document.body.innerText.includes("steam"));
		const s = await api<Settings>("GET", "/settings");
		expect(s.distracting).toEqual(["youtube.com", "x.com", "steam"]);

		await page.click('button[aria-label="Remove x.com"]');
		await page.waitForFunction(
			() => !document.body.innerText.includes("x.com"),
		);
		expect((await api<Settings>("GET", "/settings")).distracting).toEqual([
			"youtube.com",
			"steam",
		]);
		await shot("p5-01-settings-distractions");
	}, 60_000);

	test("settings: add a calendar feed", async () => {
		await open("settings");
		await waitForText("Show your meetings on Today");
		await page.type(
			'input[aria-label="Calendar address"]',
			`http://127.0.0.1:${feedServer.port}/private-1a2b3c/basic.ics`,
		);
		await click("Add calendar");
		await waitForText("Added me@example.com: 1 meeting");
		await waitForText("Synced just now");
		const body = await page.evaluate(() => document.body.innerText);
		expect(body).not.toContain("1a2b3c");
		await page.evaluate(() =>
			[...document.querySelectorAll("h2")]
				.find((h) => h.textContent === "Calendar")
				?.scrollIntoView(),
		);
		await shot("p5-02-settings-calendar");
	}, 60_000);

	test("today's timeline shows the meeting, read-only, with a join button", async () => {
		await open("today");
		await page.waitForSelector('div[title="Client call · from your calendar"]');
		expect(
			await page.$(
				'div[title="Client call · from your calendar"] button[aria-label="Join meeting"]',
			),
		).not.toBeNull();
		await page.$eval('div[title="Client call · from your calendar"]', (el) =>
			el.scrollIntoView({ block: "center" }),
		);
		await shot("p5-03-timeline-meeting");
	}, 60_000);

	test("drifting to YouTube during focus shows a nudge; Stats shows where time went", async () => {
		await open("today");
		const base = Date.now() - 3 * 60_000;
		const at = (s: number) => new Date(base + s * 1000).toISOString();
		await api("POST", "/test/window/end", { at: at(0) });
		for (let s = 0; s <= 40; s += 5)
			await api("POST", "/test/window", {
				exe: "code.exe",
				title: "webhook.ts - smp - Visual Studio Code",
				at: at(s),
			});
		for (let s = 45; s <= 85; s += 5)
			await api("POST", "/test/window", {
				exe: "chrome.exe",
				title: "Lo-fi beats - YouTube - Google Chrome",
				domain: "youtube.com",
				at: at(s),
			});
		await waitForText("Still on youtube.com?");
		await shot("p5-04-drift-toast");
		for (let s = 90; s <= 150; s += 5)
			await api("POST", "/test/window", {
				exe: "code.exe",
				title: "webhook.ts - smp - Visual Studio Code",
				at: at(s),
			});
		await api("POST", "/test/window/end", { at: at(155) });

		await open("stats", "&tab=today");
		await waitForText("Where your time went");
		await waitForText("On task during focus");
		const body = await page.evaluate(() => document.body.innerText);
		expect(body).toContain("youtube.com");
		expect(body).toContain("VS Code");
		expect(body).toMatch(/Off: youtube\.com/);
		await page.evaluate(() =>
			[...document.querySelectorAll("span")]
				.find((s) => s.textContent === "Where your time went")
				?.scrollIntoView(),
		);
		await shot("p5-05-stats-apps");
	}, 60_000);

	const withGemini = process.env.GEMINI_API_KEY ? test : test.skip;
	withGemini(
		"plan with the coach: a live voice call opens and the coach speaks",
		async () => {
			await open("today");
			await click("Plan with coach");
			await waitForText("Plan with the coach");
			await waitForText("Listening", 30_000);
			// The coach greets first; its words appear as a transcript.
			await page.waitForFunction(
				() =>
					[...document.querySelectorAll("div")].some(
						(d) =>
							d.firstElementChild?.textContent === "Coach" &&
							(d.textContent?.length ?? 0) > 20,
					),
				{ timeout: 30_000 },
			);
			await shot("p5-06-coach-plan");
			await page.click('button[aria-label="End call"]');
			await page.waitForFunction(
				() => !document.body.innerText.includes("Plan with the coach"),
				{ timeout: 10_000 },
			);
		},
		90_000,
	);

	test("starting a session before a meeting offers to fit it in", async () => {
		const state = await api<{ session: unknown }>("GET", "/session/state");
		if (state.session) await api("POST", "/session/stop", {});
		await open("today");
		await page.keyboard.press("s");
		await waitForText("Start a focus session");
		await waitForText(`Client call at ${minToHhmm(callMin)}`);
		const fit = await page.evaluate(
			() =>
				[...document.querySelectorAll("button")]
					.map((b) => b.innerText.trim())
					.find((t) => t.startsWith("Fit to")) ?? "",
		);
		expect(fit).toMatch(/^Fit to \d+ min$/);
		await shot("p5-07-meeting-clash");
		await click(fit);
		const minutes = Number(fit.match(/\d+/)![0]);
		expect(
			await page.$eval(
				'input[aria-label="Minutes"]',
				(el) => (el as HTMLInputElement).value,
			),
		).toBe(String(minutes));
		// Once it fits, the warning goes away.
		await page.waitForFunction(
			() => !document.body.innerText.includes("Fit to"),
			{ timeout: 5_000 },
		);
	}, 60_000);
});
