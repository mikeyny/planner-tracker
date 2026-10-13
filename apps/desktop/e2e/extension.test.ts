/**
 * The Deep Focus Guard browser extension, loaded into Chrome for Testing and pointed
 * at a TEST API. Branded Chrome no longer loads unpacked extensions from the command
 * line, so this needs Chrome for Testing:
 *
 *   bunx @puppeteer/browsers install chrome@stable --path <dir>
 *   DEEP_E2E_EXT_CHROME=<dir>/chrome/win64-…/chrome-win64/chrome.exe bun test e2e/extension
 *
 * Expects the "active" demo seed (a focus session on SMP is running).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BrowserState, Capture } from "@deep/shared";
import puppeteer, {
	type Browser,
	type Page,
	type WebWorker,
} from "puppeteer-core";

const API = process.env.DEEP_E2E_API ?? "http://127.0.0.1:4050";
const CHROME = process.env.DEEP_E2E_EXT_CHROME;
const TOKEN = process.env.DEEP_TOKEN ?? "";
const OUT = process.env.DEEP_E2E_OUT ?? resolve(import.meta.dir, "out");
const EXT = resolve(import.meta.dir, "../../browser");
const ID = "nkbkoiecbflilimenhnijdpodjacajmo";
const run = CHROME ? describe : describe.skip;

let browser: Browser;
let worker: WebWorker;
let page: Page;

async function api<T>(method: string, path: string, body?: unknown) {
	const res = await fetch(`${API}/api${path}`, {
		method,
		headers: { "X-Deep-Token": TOKEN, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
	return (await res.json()) as T;
}

const ruleCount = () =>
	worker.evaluate(
		async () => (await chrome.declarativeNetRequest.getDynamicRules()).length,
	) as Promise<number>;

async function waitFor(fn: () => Promise<boolean>, timeout = 15_000) {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		if (await fn()) return;
		await Bun.sleep(250);
	}
	throw new Error("timed out");
}

declare const chrome: {
	storage: { local: { set: (v: object) => Promise<void> } };
	declarativeNetRequest: { getDynamicRules: () => Promise<unknown[]> };
};

run("browser extension", () => {
	beforeAll(async () => {
		mkdirSync(OUT, { recursive: true });
		await api("POST", "/test/browser/reset");
		await api("PUT", "/settings", {
			blockSites: true,
			distracting: ["youtube.com", "blocked.test"],
		});
		const s = await api<{ session: { pausedAt: string | null } | null }>(
			"GET",
			"/session/state",
		);
		if (s.session?.pausedAt) await api("POST", "/session/resume");

		browser = await puppeteer.launch({
			executablePath: CHROME,
			headless: true,
			// enableExtensions needs a pipe transport, which hangs under Bun on Windows.
			ignoreDefaultArgs: ["--disable-extensions"],
			args: [
				"--no-first-run",
				"--no-default-browser-check",
				`--disable-extensions-except=${EXT}`,
				`--load-extension=${EXT}`,
			],
		});
		const target = await browser.waitForTarget(
			(t) => t.type() === "service_worker" && t.url().includes(ID),
			{ timeout: 20_000 },
		);
		worker = (await target.worker())!;
		// Point the extension at the test API instead of the real one on :4040.
		await worker.evaluate((api) => chrome.storage.local.set({ api }), API);
		page = await browser.newPage();
	}, 60_000);

	afterAll(async () => {
		await browser?.close();
	});

	test("pairs by itself and installs the blocking rules", async () => {
		await waitFor(async () => (await ruleCount()) === 2);
	}, 20_000);

	test("a blocked site shows the focus page with the session", async () => {
		await page.goto("http://blocked.test/videos/123?t=4", {
			waitUntil: "domcontentloaded",
		});
		expect(page.url()).toBe(
			`chrome-extension://${ID}/blocked.html#http://blocked.test/videos/123?t=4`,
		);
		await page.waitForFunction(
			() => document.getElementById("title")?.textContent?.includes("SMP"),
			{ timeout: 10_000 },
		);
		const title = await page.$eval("#title", (e) => e.textContent);
		expect(title).toBe("This can wait. You're on SMP.");
		const sub = await page.$eval("#sub", (e) => e.textContent ?? "");
		expect(sub).toMatch(/min left/);
		await page.screenshot({ path: join(OUT, "ext-blocked.png") });

		await waitFor(async () => {
			const caps = await api<Capture[]>("GET", "/captures?status=all&today=1");
			return caps.some((c) => c.text === "Tried to open blocked.test");
		});
	}, 30_000);

	test("“I need it” asks why, waits 10 seconds, then lets the site through", async () => {
		await page.click("#need");
		expect(
			await page.$eval("#open", (b) => (b as HTMLButtonElement).disabled),
		).toBe(true);
		await page.type("#reason", "the API docs are there");
		await page.waitForFunction(
			() => !(document.getElementById("open") as HTMLButtonElement).disabled,
			{ timeout: 15_000 },
		);
		await page.screenshot({ path: join(OUT, "ext-need-it.png") });
		await Promise.all([
			page.waitForNavigation({ timeout: 15_000 }).catch(() => null),
			page.click("#open"),
		]);
		const state = await api<BrowserState>("GET", "/browser/state");
		expect(state.allowed).toEqual(["blocked.test"]);
		await waitFor(async () => (await ruleCount()) === 1);
		const caps = await api<Capture[]>("GET", "/captures?status=all&today=1");
		expect(
			caps.some(
				(c) =>
					c.text === "Opened blocked.test during focus: the API docs are there",
			),
		).toBe(true);
	}, 40_000);

	test("pausing the session lifts all blocks right away", async () => {
		await api("POST", "/session/pause");
		await waitFor(async () => (await ruleCount()) === 0, 8_000);
		await api("POST", "/session/resume");
		await waitFor(async () => (await ruleCount()) === 1, 8_000);
	}, 20_000);

	test("the popup shows what's blocked", async () => {
		const popup = await browser.newPage();
		await popup.goto(`chrome-extension://${ID}/popup.html`);
		await popup.waitForFunction(
			() => document.getElementById("head")?.textContent?.includes("SMP"),
			{ timeout: 10_000 },
		);
		const text = await popup.evaluate(() => document.body.innerText);
		expect(text).toContain("Focusing on SMP");
		expect(text).toContain("blocked.test (allowed for now)");
		await popup.setViewport({ width: 320, height: 220 });
		await popup.screenshot({ path: join(OUT, "ext-popup.png") });
		await popup.close();
	}, 20_000);

	test("reports the active site to Deep", async () => {
		const st = await api<{ connected: boolean }>("GET", "/browser/status");
		expect(st.connected).toBe(true);
	});
});
