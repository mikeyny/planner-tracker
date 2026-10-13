import { db, windowSpans } from "@deep/db";
import type { Drift } from "@deep/shared";
import { eq, lt } from "drizzle-orm";
import { classify, describe } from "./apps";
import { siteForWindow } from "./browser";
import { broadcast } from "./bus";
import { foregroundAvailable, foregroundWindow } from "./foreground";
import { systemIdleSec } from "./idle";
import { getSettings } from "./settings";
import { getOpenPause, getOpenSessionRow, toActiveSession } from "./state";

const SAMPLE_MS = 5_000;
/** No keyboard or mouse input for this long counts as away from the screen. */
const AWAY_SEC = 180;
/** A distraction in front this long during focus earns a nudge… */
const DRIFT_NUDGE_SEC = 30;
/** …and another one every this many seconds while it continues. */
const DRIFT_REPEAT_SEC = 300;
/** This long back on something else ends a drift episode. */
const DRIFT_RESET_SEC = 10;

interface OpenSpan {
	id: number;
	key: string;
	startedAt: number;
	lastAt: number;
}

let current: OpenSpan | null = null;
let drift: {
	sessionId: number;
	startedAt: number;
	lastAt: number;
	nudgedAt: number;
} | null = null;
let lastPrune = 0;

async function closeSpan(at = Date.now()) {
	if (!current) return;
	const span = current;
	current = null;
	await db
		.update(windowSpans)
		.set({
			endedAt: new Date(at).toISOString(),
			sec: Math.max(0, Math.round((at - span.startedAt) / 1000)),
		})
		.where(eq(windowSpans.id, span.id));
}

/** Describe and classify a window ("chrome.exe", "Inbox - Google Chrome"). */
export async function sampleOf(fg: {
	exe: string;
	title: string;
	domain?: string | null;
}) {
	const settings = await getSettings();
	const d = describe({
		exe: fg.exe,
		title: fg.title,
		domain: fg.domain ?? siteForWindow(fg.title),
	});
	return {
		...d,
		exe: fg.exe,
		category: classify(d, { distracting: settings.distracting }),
	};
}

export type Sample = Awaited<ReturnType<typeof sampleOf>>;

async function tick() {
	const settings = await getSettings();
	const now = Date.now();
	if (now - lastPrune > 60 * 60_000) {
		lastPrune = now;
		await db
			.delete(windowSpans)
			.where(
				lt(
					windowSpans.startedAt,
					new Date(
						now - settings.windowRetentionDays * 86_400_000,
					).toISOString(),
				),
			);
	}
	if (!settings.windowTracking || systemIdleSec() >= AWAY_SEC) {
		// Away (or tracking off): the span ends at its last sample.
		await closeSpan(current?.lastAt ?? now);
		drift = null;
		return;
	}
	const fg = foregroundWindow();
	if (!fg) {
		await closeSpan(now);
		return;
	}
	await ingest(await sampleOf(fg), now);
}

/** Record one sample taken at `now`: extend or start a span, and watch for drift. */
export async function ingest(s: Sample, now = Date.now()) {
	const open = await getOpenSessionRow();
	const focusing =
		open?.kind === "focus" && !(await getOpenPause(open.id)) ? open : null;
	const sessionId = focusing?.id ?? null;
	const key = [s.app, s.detail, s.site, s.category, sessionId].join("\u0001");

	if (current && current.key === key && now - current.lastAt < SAMPLE_MS * 3) {
		current.lastAt = now;
		await db
			.update(windowSpans)
			.set({
				endedAt: new Date(now).toISOString(),
				sec: Math.round((now - current.startedAt) / 1000),
			})
			.where(eq(windowSpans.id, current.id));
	} else {
		// Back-to-back samples: the old span ends where the new one starts.
		const contiguous = current && now - current.lastAt < SAMPLE_MS * 3;
		await closeSpan(contiguous ? now : (current?.lastAt ?? now));
		const [row] = await db
			.insert(windowSpans)
			.values({
				app: s.app.slice(0, 100),
				exe: s.exe.slice(0, 100),
				detail: s.detail.slice(0, 300) || null,
				site: s.site,
				category: s.category,
				startedAt: new Date(now).toISOString(),
				endedAt: new Date(now).toISOString(),
				sec: 0,
				sessionId,
			})
			.returning({ id: windowSpans.id });
		current = { id: row!.id, key, startedAt: now, lastAt: now };
	}

	await checkDrift(
		focusing,
		s.category === "distraction" ? (s.site ?? s.app) : null,
		now,
	);
}

async function checkDrift(
	focusing: Awaited<ReturnType<typeof getOpenSessionRow>> | null,
	label: string | null,
	now: number,
) {
	if (!focusing || !label) {
		if (drift && (!focusing || now - drift.lastAt > DRIFT_RESET_SEC * 1000))
			drift = null;
		return;
	}
	if (!drift || drift.sessionId !== focusing.id) {
		drift = {
			sessionId: focusing.id,
			startedAt: now,
			lastAt: now,
			nudgedAt: 0,
		};
		return;
	}
	drift.lastAt = now;
	const sec = Math.round((now - drift.startedAt) / 1000);
	const due = drift.nudgedAt
		? now - drift.nudgedAt >= DRIFT_REPEAT_SEC * 1000
		: sec >= DRIFT_NUDGE_SEC;
	if (!due || !(await getSettings()).driftNudge) return;
	drift.nudgedAt = now;
	const active = await toActiveSession(focusing);
	const event: Drift = {
		sessionId: focusing.id,
		label,
		sec,
		project: active.project,
	};
	broadcast({ type: "drift", drift: event });
}

/** End the current span (tests, and when tracking is switched off). */
export async function endSpan(at = Date.now()) {
	await closeSpan(at);
	drift = null;
}

export function startWindowWatcher() {
	if (!foregroundAvailable) {
		console.warn("[windows] foreground window tracking unavailable");
		return;
	}
	let busy = false;
	setInterval(() => {
		if (busy) return;
		busy = true;
		tick()
			.catch((err) => console.error("[windows] tick failed:", err))
			.finally(() => {
				busy = false;
			});
	}, SAMPLE_MS);
}
