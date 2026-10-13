/**
 * End-to-end checks for Phase 5 (browser blocking, window tracking, calendar, coach)
 * against a running TEST API started with DEEP_TEST=1 (see phase4.e2e.test.ts).
 * Expects the "active" demo seed: a focus session on SMP is running.
 *
 * Skipped unless DEEP_E2E_API is set, so `bun test` never touches real data.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	type ActiveState,
	type AppUsage,
	type BrowserState,
	type CalendarFeed,
	type Capture,
	type CoachServerMessage,
	localDate,
	minToHhmm,
	type NextMeeting,
	type ServerEvent,
	type Settings,
	type TimeBlock,
} from "@deep/shared";

const API = process.env.DEEP_E2E_API;
const TOKEN = process.env.DEEP_TOKEN ?? "";
const run = API ? describe : describe.skip;

// bun test runs in UTC; meetings are laid out in the API's local time, so match it.
if (API) {
	const health = (await (await fetch(`${API}/health`)).json()) as {
		timeZone?: string;
	};
	if (health.timeZone) process.env.TZ = health.timeZone;
}
const EXTENSION_ORIGIN = "chrome-extension://nkbkoiecbflilimenhnijdpodjacajmo";

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

async function status(method: string, path: string, body?: unknown) {
	const res = await fetch(`${API}/api${path}`, {
		method,
		headers: { "X-Deep-Token": TOKEN, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	return {
		status: res.status,
		json: (await res.json()) as { message?: string },
	};
}

/** Collect server events from the live socket while `fn` runs. */
async function eventsDuring(
	fn: () => Promise<void>,
	settleMs = 400,
): Promise<ServerEvent[]> {
	const ws = new WebSocket(
		`${API!.replace("http", "ws")}/ws?token=${encodeURIComponent(TOKEN)}`,
	);
	const events: ServerEvent[] = [];
	ws.onmessage = (m) => events.push(JSON.parse(String(m.data)));
	await new Promise((r) => (ws.onopen = r));
	await fn();
	await Bun.sleep(settleMs);
	ws.close();
	return events;
}

const today = localDate();

run("browser extension", () => {
	beforeAll(async () => {
		await call("POST", "/test/browser/reset");
		await call("PUT", "/settings", {
			blockSites: true,
			distracting: ["youtube.com", "x.com", "steam"],
		});
		const state = await call<ActiveState>("GET", "/session/state");
		if (state.session?.pausedAt) await call("POST", "/session/resume");
	});

	test("only the Deep extension can pair", async () => {
		const denied = await fetch(`${API}/pair`, {
			method: "POST",
			headers: { Origin: "https://evil.example" },
		});
		expect(denied.status).toBe(403);
		const noOrigin = await fetch(`${API}/pair`, { method: "POST" });
		expect(noOrigin.status).toBe(403);
		const ok = await fetch(`${API}/pair`, {
			method: "POST",
			headers: { Origin: EXTENSION_ORIGIN },
		});
		expect(ok.status).toBe(200);
		expect(((await ok.json()) as { token: string }).token).toBe(TOKEN);
	});

	test("blocks domains (not app keywords) while focusing", async () => {
		const s = await call<BrowserState>("GET", "/browser/state");
		expect(s.blocking).toBe(true);
		expect(s.sites).toEqual(["youtube.com", "x.com"]);
		expect(s.session?.project).toBe("SMP");
		expect(s.session?.endsAt).toBeTruthy();
	});

	test("pausing lifts the block; resuming brings it back", async () => {
		await call("POST", "/session/pause");
		expect((await call<BrowserState>("GET", "/browser/state")).blocking).toBe(
			false,
		);
		await call("POST", "/session/resume");
		expect((await call<BrowserState>("GET", "/browser/state")).blocking).toBe(
			true,
		);
	});

	test("letting a site through logs the urge with its reason", async () => {
		const events = await eventsDuring(async () => {
			const s = await call<BrowserState>("POST", "/browser/allow", {
				site: "youtube.com",
				minutes: 5,
				reason: "webhook tutorial",
			});
			expect(s.allowed).toEqual(["youtube.com"]);
		});
		expect(events.some((e) => e.type === "browser")).toBe(true);
		const caps = await call<Capture[]>("GET", "/captures?status=all&today=1");
		expect(
			caps.some(
				(c) =>
					c.kind === "urge" &&
					c.text === "Opened youtube.com during focus: webhook tutorial",
			),
		).toBe(true);
	});

	test("a blocked page is logged once per site every two minutes", async () => {
		const first = await call<{ logged: boolean }>("POST", "/browser/blocked", {
			site: "x.com",
		});
		const again = await call<{ logged: boolean }>("POST", "/browser/blocked", {
			site: "x.com",
		});
		expect(first.logged).toBe(true);
		expect(again.logged).toBe(false);
	});

	test("heartbeats mark the extension as connected", async () => {
		await call("POST", "/browser/heartbeat", {
			domain: "github.com",
			title: "deep/pulls",
			focused: true,
		});
		const st = await call<{ connected: boolean; folder: string }>(
			"GET",
			"/browser/status",
		);
		expect(st.connected).toBe(true);
		expect(st.folder.replaceAll("\\", "/")).toEndWith("apps/browser");
	});
});

run("window tracking", () => {
	const t0 = Date.now() - 20 * 60_000;
	const at = (sec: number) => new Date(t0 + sec * 1000).toISOString();
	const sample = (sec: number, exe: string, title: string, domain?: string) =>
		call("POST", "/test/window", { exe, title, domain, at: at(sec) });

	beforeAll(async () => {
		await call("PUT", "/settings", {
			driftNudge: true,
			distracting: ["youtube.com", "x.com", "steam"],
		});
		await call("POST", "/test/window/end", { at: at(0) });
	});

	test("samples become spans, and a distraction during focus earns one nudge", async () => {
		const events = await eventsDuring(async () => {
			for (let s = 0; s <= 60; s += 5)
				await sample(s, "code.exe", "webhook.ts - smp - Visual Studio Code");
			for (let s = 65; s <= 110; s += 5)
				await sample(
					s,
					"chrome.exe",
					"Lo-fi beats - YouTube - Google Chrome",
					"youtube.com",
				);
			for (let s = 115; s <= 180; s += 5)
				await sample(s, "code.exe", "webhook.ts - smp - Visual Studio Code");
			await call("POST", "/test/window/end", { at: at(185) });
		});
		const drifts = events.filter((e) => e.type === "drift");
		expect(drifts.length).toBe(1);
		const d = drifts[0] as Extract<ServerEvent, { type: "drift" }>;
		expect(d.drift.label).toBe("youtube.com");
		expect(d.drift.project?.name).toBe("SMP");
		expect(d.drift.sec).toBeGreaterThanOrEqual(30);

		const u = await call<AppUsage>("GET", `/stats/apps?date=${today}`);
		const yt = u.items.find((i) => i.label === "youtube.com");
		expect(yt?.category).toBe("distraction");
		expect(yt?.focusSec).toBe(50);
		const code = u.items.find((i) => i.label === "VS Code");
		expect(code?.category).toBe("work");
		expect(code?.sec).toBeGreaterThanOrEqual(125);
		expect(u.offTaskSec).toBe(50);
	});

	test("a distracting app keyword counts too", async () => {
		const s = await call<{ category: string; app: string }>(
			"POST",
			"/test/window",
			{ exe: "steamwebhelper.exe", title: "Steam", at: at(300) },
		);
		expect(s.category).toBe("distraction");
		await call("POST", "/test/window/end", { at: at(305) });
	});
});

run("calendar", () => {
	let server: ReturnType<typeof Bun.serve>;
	let feedUrl = "";
	// A meeting starting about an hour from now (clamped to today), and a daily standup.
	const now = new Date();
	const startMin = Math.min(
		22 * 60,
		now.getHours() * 60 + now.getMinutes() + 60,
	);
	const start = new Date(now);
	start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
	const end = new Date(start.getTime() + 30 * 60_000);
	const stamp = (d: Date) =>
		d
			.toISOString()
			.replace(/[-:]/g, "")
			.replace(/\.\d{3}/, "");
	const standup = new Date(now);
	standup.setDate(standup.getDate() - 3);
	standup.setHours(6, 0, 0, 0);
	const ics = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Google Inc//Google Calendar 70.9054//EN",
		"X-WR-CALNAME:test@example.com",
		"BEGIN:VEVENT",
		"UID:client-call@google.com",
		`DTSTART:${stamp(start)}`,
		`DTEND:${stamp(end)}`,
		"SUMMARY:Client call",
		"X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
		"END:VEVENT",
		"BEGIN:VEVENT",
		"UID:standup@google.com",
		`DTSTART:${stamp(standup)}`,
		`DTEND:${stamp(new Date(standup.getTime() + 15 * 60_000))}`,
		"RRULE:FREQ=DAILY",
		"SUMMARY:Standup",
		"END:VEVENT",
		"BEGIN:VEVENT",
		"UID:declined@google.com",
		`DTSTART:${stamp(new Date(start.getTime() + 60 * 60_000))}`,
		`DTEND:${stamp(new Date(start.getTime() + 90 * 60_000))}`,
		"SUMMARY:Optional sync",
		"ATTENDEE;PARTSTAT=DECLINED:mailto:test@example.com",
		"END:VEVENT",
		"END:VCALENDAR",
	].join("\r\n");

	beforeAll(async () => {
		server = Bun.serve({
			port: 0,
			fetch: (req) =>
				new URL(req.url).pathname === "/private-abc123/basic.ics"
					? new Response(ics, { headers: { "Content-Type": "text/calendar" } })
					: new Response("not found", { status: 404 }),
		});
		feedUrl = `http://127.0.0.1:${server.port}/private-abc123/basic.ics`;
		for (const f of await call<CalendarFeed[]>("GET", "/calendars"))
			await call("DELETE", `/calendars/${f.id}`);
	});
	afterAll(() => server?.stop(true));

	test("a wrong address is refused with a helpful message", async () => {
		const res = await status("POST", "/calendars", {
			url: `http://127.0.0.1:${server.port}/nope.ics`,
		});
		expect(res.status).toBe(400);
		expect(res.json.message).toContain("Secret address in iCal format");
	});

	test("adding a feed syncs its meetings onto the timeline", async () => {
		const feed = await call<CalendarFeed>("POST", "/calendars", {
			url: feedUrl,
		});
		expect(feed.name).toBe("test@example.com");
		expect(feed.url).not.toContain("abc123");
		expect(feed.lastError).toBeNull();
		// Standup daily for -1..+14 days (16) + the client call; the declined one is skipped.
		expect(feed.eventCount).toBe(17);

		const day = await call<{ blocks: TimeBlock[] }>("GET", `/day/${today}`);
		const cal = day.blocks.filter((b) => b.source === "calendar");
		expect(cal.map((b) => b.title).sort()).toEqual(["Client call", "Standup"]);
		const client = cal.find((b) => b.title === "Client call")!;
		expect(client.startMin).toBe(startMin);
		expect(client.durationMin).toBe(30);
		expect(client.url).toBe("https://meet.google.com/abc-defg-hij");
		expect(client.kind).toBe("meeting");
	});

	test("saving the timeline keeps calendar meetings and never duplicates them", async () => {
		const before = await call<{ blocks: TimeBlock[] }>("GET", `/day/${today}`);
		const manual = before.blocks.filter((b) => b.source === "manual");
		// The app sends back everything it shows, calendar blocks included.
		await call("PUT", `/day/${today}/blocks`, {
			blocks: before.blocks.map(({ id: _i, date: _d, url: _u, ...b }) => b),
		});
		const after = await call<{ blocks: TimeBlock[] }>("GET", `/day/${today}`);
		expect(after.blocks.filter((b) => b.source === "calendar").length).toBe(2);
		expect(after.blocks.filter((b) => b.source === "manual").length).toBe(
			manual.length,
		);
	});

	test("the next meeting is known, for the start-session warning", async () => {
		const next = await call<NextMeeting | null>("GET", "/calendars/next");
		expect(next).not.toBeNull();
		expect(next!.title).toBe("Client call");
		expect(next!.at).toBe(minToHhmm(startMin));
		expect(next!.url).toBe("https://meet.google.com/abc-defg-hij");
	});

	test("switching a feed off or removing it clears its meetings", async () => {
		const [feed] = await call<CalendarFeed[]>("GET", "/calendars");
		await call("PATCH", `/calendars/${feed!.id}`, { enabled: false });
		let day = await call<{ blocks: TimeBlock[] }>("GET", `/day/${today}`);
		expect(day.blocks.some((b) => b.source === "calendar")).toBe(false);
		await call("PATCH", `/calendars/${feed!.id}`, { enabled: true });
		day = await call<{ blocks: TimeBlock[] }>("GET", `/day/${today}`);
		expect(day.blocks.filter((b) => b.source === "calendar").length).toBe(2);
		await call("DELETE", `/calendars/${feed!.id}`);
		day = await call<{ blocks: TimeBlock[] }>("GET", `/day/${today}`);
		expect(day.blocks.some((b) => b.source === "calendar")).toBe(false);
	});

	test("an unreachable feed keeps its last copy and reports the error", async () => {
		const feed = await call<CalendarFeed>("POST", "/calendars", {
			url: feedUrl,
		});
		server.stop(true);
		const [synced] = await call<CalendarFeed[]>("POST", "/calendars/sync");
		expect(synced!.id).toBe(feed.id);
		expect(synced!.lastError).toBeTruthy();
		const day = await call<{ blocks: TimeBlock[] }>("GET", `/day/${today}`);
		expect(day.blocks.filter((b) => b.source === "calendar").length).toBe(2);
		await call("DELETE", `/calendars/${feed.id}`);
	});
});

run("settings", () => {
	test("Phase 5 settings round-trip", async () => {
		const s = await call<Settings>("PUT", "/settings", {
			coachCheckins: "both",
			coachVoice: "Puck",
			windowRetentionDays: 14,
		});
		expect(s.coachCheckins).toBe("both");
		expect(s.coachVoice).toBe("Puck");
		const bad = await status("PUT", "/settings", { coachCheckins: "always" });
		expect(bad.status).toBe(400);
		await call("PUT", "/settings", {
			coachCheckins: "off",
			coachVoice: "Kore",
		});
	});
});

const coach = API && process.env.GEMINI_API_KEY ? describe : describe.skip;

coach("voice coach (Gemini Live, typed turns)", () => {
	test("an unknown mode is refused", async () => {
		const res = await fetch(`${API}/coach?mode=chat&token=${TOKEN}`);
		expect(res.status).toBe(400);
	});

	test("a check-in saves the intention and ends by itself", async () => {
		const ws = new WebSocket(
			`${API!.replace("http", "ws")}/coach?mode=checkin&token=${encodeURIComponent(TOKEN)}`,
		);
		ws.binaryType = "arraybuffer";
		const messages: CoachServerMessage[] = [];
		let audioBytes = 0;
		let turns = 0;
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("coach timed out")),
				60_000,
			);
			ws.onmessage = (e) => {
				if (typeof e.data !== "string") {
					audioBytes += (e.data as ArrayBuffer).byteLength;
					return;
				}
				const m = JSON.parse(e.data) as CoachServerMessage;
				messages.push(m);
				if (m.type === "turn_complete" && ++turns === 1)
					ws.send(
						JSON.stringify({
							type: "text",
							text: "I'll get the Paynow signature test passing. First step is logging the raw body.",
						}),
					);
			};
			ws.onclose = () => {
				clearTimeout(timer);
				resolve();
			};
		});
		expect(audioBytes).toBeGreaterThan(10_000);
		const intention = messages.find(
			(m) => m.type === "action" && m.action === "intention",
		) as Extract<CoachServerMessage, { action: "intention" }> | undefined;
		expect(intention?.intention.toLowerCase()).toContain("signature");
		expect(messages.at(-1)).toMatchObject({ type: "ended", reason: "done" });
		const state = await call<ActiveState>("GET", "/session/state");
		expect(state.session?.intention).toBe(intention!.intention);
	}, 70_000);
});
