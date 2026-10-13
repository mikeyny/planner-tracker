import { resolve } from "node:path";
import { captures, db } from "@deep/db";
import {
	type BrowserState,
	type BrowserStatus,
	remainingSec,
} from "@deep/shared";
import { broadcast, changed } from "./bus";
import { getSettings } from "./settings";
import { getOpenSessionRow, toActiveSession } from "./state";

/** Fixed by the `key` in apps/browser/manifest.json, so only our extension can pair. */
export const EXTENSION_ID = "nkbkoiecbflilimenhnijdpodjacajmo";
export const EXTENSION_FOLDER = resolve(
	import.meta.dir,
	"..",
	"..",
	"..",
	"browser",
);

/** A bare domain ("youtube.com", "*.reddit.com"), as opposed to an app keyword ("steam"). */
export function isDomain(entry: string) {
	return /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(entry);
}

/* ---------------- temporary allowances ---------------- */

const allowances = new Map<string, number>();

function liveAllowances(now = Date.now()) {
	for (const [site, until] of allowances)
		if (until <= now) allowances.delete(site);
	return allowances;
}

export async function browserState(): Promise<BrowserState> {
	const settings = await getSettings();
	const row = await getOpenSessionRow();
	const s = row ? await toActiveSession(row) : null;
	const focusing = Boolean(s && s.kind === "focus" && !s.pausedAt);
	const sites = [
		...new Set(
			settings.distracting.map((d) => d.trim().toLowerCase()).filter(isDomain),
		),
	];
	const allowed = [...liveAllowances().keys()].filter((a) => sites.includes(a));
	const left = s && focusing ? remainingSec(s) : null;
	return {
		enabled: settings.blockSites,
		blocking: settings.blockSites && focusing && sites.length > 0,
		sites,
		allowed,
		session:
			s && focusing
				? {
						project: s.project?.name ?? null,
						color: s.project?.color ?? null,
						intention: s.intention,
						endsAt:
							left === null
								? null
								: new Date(Date.now() + Math.max(0, left) * 1000).toISOString(),
					}
				: null,
	};
}

async function logUrge(text: string) {
	const open = await getOpenSessionRow();
	await db.insert(captures).values({
		text,
		kind: "urge",
		sessionId: open?.id ?? null,
		projectId: open?.projectId ?? null,
		status: "triaged",
	});
	changed("captures");
}

/** Let one site through for a few minutes, and log why. */
export async function allowSite(
	site: string,
	minutes: number,
	reason: string | null,
) {
	allowances.set(site, Date.now() + minutes * 60_000);
	// Tell the extension when the time is up so it blocks the site again.
	setTimeout(() => broadcast({ type: "browser" }), minutes * 60_000 + 500);
	await logUrge(
		reason
			? `Opened ${site} during focus: ${reason}`
			: `Opened ${site} during focus`,
	);
	broadcast({ type: "browser" });
}

const lastBlockLog = new Map<string, number>();
const BLOCK_LOG_EVERY_MS = 2 * 60_000;

/** A blocked page was shown. Logged as an urge, at most once per site every 2 minutes. */
export async function siteBlocked(site: string) {
	const now = Date.now();
	if (now - (lastBlockLog.get(site) ?? 0) < BLOCK_LOG_EVERY_MS) return false;
	lastBlockLog.set(site, now);
	await logUrge(`Tried to open ${site}`);
	return true;
}

/* ---------------- active tab ---------------- */

export interface TabReport {
	domain: string | null;
	title: string | null;
	focused: boolean;
	at: number;
}

let lastTab: TabReport | null = null;
let lastSeen = 0;

export function reportTab(tab: Omit<TabReport, "at">) {
	lastSeen = Date.now();
	lastTab = { ...tab, at: lastSeen };
}

const TAB_FRESH_MS = 75_000;

/**
 * The site in the browser's active tab, if the extension reported it recently and
 * its tab title matches the window in front.
 */
export function siteForWindow(title: string): string | null {
	if (!lastTab?.domain || Date.now() - lastTab.at > TAB_FRESH_MS) return null;
	const t = lastTab.title?.trim();
	if (t && title.startsWith(t)) return lastTab.domain;
	return null;
}

export function browserStatus(): BrowserStatus {
	return {
		connected: Date.now() - lastSeen < 90_000,
		lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
		extensionId: EXTENSION_ID,
		folder: EXTENSION_FOLDER,
	};
}

/** For tests. */
export function resetBrowser() {
	allowances.clear();
	lastBlockLog.clear();
	lastTab = null;
	lastSeen = 0;
}
