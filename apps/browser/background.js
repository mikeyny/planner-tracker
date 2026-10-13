// Deep Focus Guard: blocks distracting sites while a Deep focus session runs,
// and reports the active tab's site so Deep can show where time went.

const DEFAULT_API = "http://127.0.0.1:4040";
const RULE_BASE = 1000;
const BLOCKED_PAGE = chrome.runtime.getURL("blocked.html");

/** @type {{ api: string, token: string | null } | null} */
let cfg = null;
/** @type {WebSocket | null} */
let socket = null;
/** Last state from Deep: { blocking, sites, allowed, session } */
let state = null;
let lastError = null;
let lastBeat = { key: "", at: 0 };

async function config() {
	if (cfg) return cfg;
	const { api = DEFAULT_API, token = null } = await chrome.storage.local.get([
		"api",
		"token",
	]);
	cfg = { api, token };
	return cfg;
}

/** Deep hands its key to this extension (it checks the extension's ID). */
async function pair() {
	const c = await config();
	const res = await fetch(`${c.api}/pair`, { method: "POST" });
	if (!res.ok) throw new Error(`Deep refused to pair (${res.status}).`);
	const { token } = await res.json();
	c.token = token;
	await chrome.storage.local.set({ token });
}

async function call(path, body) {
	const c = await config();
	if (!c.token) await pair();
	const res = await fetch(`${c.api}/api${path}`, {
		method: body ? "POST" : "GET",
		headers: {
			"X-Deep-Token": c.token,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (res.status === 401) {
		// The key changed: pair again next time.
		c.token = null;
		await chrome.storage.local.remove("token");
		throw new Error("Deep's key changed. Reconnecting.");
	}
	if (!res.ok) throw new Error(`Deep answered ${res.status} for ${path}.`);
	return res.json();
}

/* ---------------- blocking ---------------- */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function hostOf(url) {
	try {
		const u = new URL(url);
		return u.protocol === "http:" || u.protocol === "https:"
			? u.hostname.toLowerCase()
			: null;
	} catch {
		return null;
	}
}

function siteMatches(host, site) {
	const s = site.replace(/^\*\./, "");
	return host === s || host.endsWith(`.${s}`);
}

function blockedSites(s) {
	if (!s?.blocking) return [];
	return s.sites.filter((x) => !s.allowed.includes(x));
}

async function applyRules(s) {
	const sites = blockedSites(s);
	const existing = await chrome.declarativeNetRequest.getDynamicRules();
	const addRules = sites.map((site, i) => ({
		id: RULE_BASE + i,
		priority: 1,
		action: {
			type: "redirect",
			redirect: { regexSubstitution: `${BLOCKED_PAGE}#\\0` },
		},
		condition: {
			regexFilter: `^https?://([^/?#]*\\.)?${escapeRe(site.replace(/^\*\./, ""))}([/:?#].*)?$`,
			resourceTypes: ["main_frame"],
		},
	}));
	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: existing.map((r) => r.id),
		addRules,
	});
	if (sites.length === 0) {
		await chrome.action.setBadgeText({ text: "" });
		return;
	}
	await chrome.action.setBadgeText({ text: "on" });
	await chrome.action.setBadgeBackgroundColor({
		color: s.session?.color ?? "#7c6cf0",
	});
	// Tabs already open on a blocked site are sent to the blocked page too.
	for (const tab of await chrome.tabs.query({})) {
		const host = tab.url ? hostOf(tab.url) : null;
		if (host && sites.some((site) => siteMatches(host, site))) {
			chrome.tabs.update(tab.id, { url: `${BLOCKED_PAGE}#${tab.url}` });
		}
	}
}

async function refreshOnce() {
	try {
		state = await call("/browser/state");
		lastError = null;
		await applyRules(state);
		connectSocket();
	} catch (err) {
		lastError = err instanceof Error ? err.message : String(err);
		// Deep isn't running: never leave sites blocked.
		state = null;
		await applyRules(null);
	}
}

let refreshing = null;
let again = false;
/**
 * Fetch the blocking state from Deep and apply it. A call made while one is running
 * runs once more afterwards, so a change mid-flight is never lost.
 */
function refresh() {
	if (refreshing) {
		again = true;
		return refreshing;
	}
	refreshing = (async () => {
		do {
			again = false;
			await refreshOnce();
		} while (again);
		refreshing = null;
	})();
	return refreshing;
}

/* ---------------- live updates ---------------- */

function connectSocket() {
	if (socket && socket.readyState <= WebSocket.OPEN) return;
	if (!cfg?.token) return;
	const ws = new WebSocket(
		`${cfg.api.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(cfg.token)}`,
	);
	socket = ws;
	ws.onmessage = (msg) => {
		let e;
		try {
			e = JSON.parse(msg.data);
		} catch {
			return;
		}
		if (
			e.type === "state" ||
			e.type === "browser" ||
			(e.type === "changed" && e.what.includes("settings"))
		) {
			refresh();
		}
	};
	ws.onclose = () => {
		if (socket === ws) socket = null;
	};
}

/* ---------------- site reporting ---------------- */

async function beat(force = false) {
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		});
		const win = await chrome.windows.getLastFocused().catch(() => null);
		const host = tab?.url ? hostOf(tab.url) : null;
		const domain = host ? host.replace(/^www\./, "") : null;
		const focused = Boolean(win?.focused);
		const key = `${domain}|${tab?.title}|${focused}`;
		const now = Date.now();
		if (!force && key === lastBeat.key && now - lastBeat.at < 20_000) return;
		lastBeat = { key, at: now };
		await call("/browser/heartbeat", {
			domain,
			title: tab?.title?.slice(0, 300) ?? null,
			focused,
		});
	} catch {
		// Deep isn't running; try again on the next event.
	}
}

chrome.tabs.onActivated.addListener(() => beat());
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
	if (tab.active && (info.url || info.title || info.status === "complete"))
		beat();
});
chrome.windows.onFocusChanged.addListener(() => beat());

/* ---------------- lifecycle ---------------- */

async function wake() {
	await refresh();
	await beat(true);
}

chrome.alarms.create("tick", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
	if (a.name === "tick") wake();
});
chrome.runtime.onStartup.addListener(wake);
chrome.runtime.onInstalled.addListener(wake);

chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local" && changes.api) {
		cfg = null;
		socket?.close();
		wake();
	}
});

/* ---------------- messages from the popup and blocked page ---------------- */

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
	(async () => {
		switch (msg.type) {
			case "status":
				if (!state) await refresh();
				return { state, error: lastError };
			case "allow": {
				await call("/browser/allow", {
					site: msg.site,
					minutes: msg.minutes,
					reason: msg.reason || null,
				});
				await refresh();
				return { ok: true };
			}
			case "blocked":
				await call("/browser/blocked", { site: msg.site }).catch(() => {});
				return { ok: true };
			default:
				return { error: "unknown message" };
		}
	})().then(reply, (err) =>
		reply({ error: err instanceof Error ? err.message : String(err) }),
	);
	return true;
});

wake();
