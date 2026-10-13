/**
 * Pure helpers to turn a raw foreground-window sample (exe + title [+ domain]) into
 * something friendly, and to classify it as work / comms / distraction / other.
 * No FFI, no DB — safe to use anywhere and easy to test.
 */

export type AppCategory = "work" | "comms" | "distraction" | "other";

export interface AppSample {
	exe: string;
	title: string;
	domain?: string | null;
}

export interface Described {
	/** Friendly app name, e.g. "Chrome", "VS Code", "WhatsApp". */
	app: string;
	/** Cleaned title: page title for browsers, "file - folder" for editors. */
	detail: string;
	/** Domain like "youtube.com" when known or guessable, else null. */
	site: string | null;
	browser: boolean;
}

// The default distracting list lives with the settings so the UI and API share it.
export { DEFAULT_DISTRACTING } from "@deep/shared";

// ---------------------------------------------------------------- app names

const FRIENDLY: Record<string, string> = {
	// editors / IDEs
	"code.exe": "VS Code",
	"code - insiders.exe": "VS Code Insiders",
	"cursor.exe": "Cursor",
	"windsurf.exe": "Windsurf",
	"zed.exe": "Zed",
	"devenv.exe": "Visual Studio",
	"idea64.exe": "IntelliJ IDEA",
	"pycharm64.exe": "PyCharm",
	"webstorm64.exe": "WebStorm",
	"rider64.exe": "Rider",
	"goland64.exe": "GoLand",
	"clion64.exe": "CLion",
	"phpstorm64.exe": "PhpStorm",
	"datagrip64.exe": "DataGrip",
	"studio64.exe": "Android Studio",
	"sublime_text.exe": "Sublime Text",
	"notepad++.exe": "Notepad++",
	// terminals
	"windowsterminal.exe": "Terminal",
	"wt.exe": "Terminal",
	"openconsole.exe": "Terminal",
	"cmd.exe": "Command Prompt",
	"powershell.exe": "PowerShell",
	"pwsh.exe": "PowerShell",
	"mintty.exe": "Git Bash",
	"wezterm-gui.exe": "WezTerm",
	"alacritty.exe": "Alacritty",
	// dev tools
	"figma.exe": "Figma",
	"postman.exe": "Postman",
	"insomnia.exe": "Insomnia",
	"bruno.exe": "Bruno",
	"docker desktop.exe": "Docker Desktop",
	"githubdesktop.exe": "GitHub Desktop",
	"tableplus.exe": "TablePlus",
	"dbeaver.exe": "DBeaver",
	"deep.exe": "Deep",
	// browsers
	"chrome.exe": "Chrome",
	"msedge.exe": "Edge",
	"firefox.exe": "Firefox",
	"brave.exe": "Brave",
	"opera.exe": "Opera",
	"vivaldi.exe": "Vivaldi",
	"arc.exe": "Arc",
	"zen.exe": "Zen",
	"librewolf.exe": "LibreWolf",
	"chromium.exe": "Chromium",
	// comms
	"whatsapp.exe": "WhatsApp",
	"whatsapp.root.exe": "WhatsApp",
	"slack.exe": "Slack",
	"ms-teams.exe": "Teams",
	"teams.exe": "Teams",
	"outlook.exe": "Outlook",
	"olk.exe": "Outlook",
	"hxoutlook.exe": "Mail",
	"thunderbird.exe": "Thunderbird",
	"discord.exe": "Discord",
	"telegram.exe": "Telegram",
	"signal.exe": "Signal",
	"zoom.exe": "Zoom",
	// misc
	"explorer.exe": "File Explorer",
	"spotify.exe": "Spotify",
	"steam.exe": "Steam",
	"steamwebhelper.exe": "Steam",
	"notion.exe": "Notion",
	"obsidian.exe": "Obsidian",
	"winword.exe": "Word",
	"excel.exe": "Excel",
	"powerpnt.exe": "PowerPoint",
	"onenote.exe": "OneNote",
	"notepad.exe": "Notepad",
	"taskmgr.exe": "Task Manager",
	"systemsettings.exe": "Settings",
	"vlc.exe": "VLC",
	"claude.exe": "Claude",
	"chatgpt.exe": "ChatGPT",
};

const BROWSERS = new Set([
	"chrome.exe",
	"msedge.exe",
	"firefox.exe",
	"brave.exe",
	"opera.exe",
	"vivaldi.exe",
	"arc.exe",
	"zen.exe",
	"librewolf.exe",
	"chromium.exe",
	"iexplore.exe",
]);

/** Apps that always count as work (exe names). Never overridden by "distracting" rules. */
const WORK_EXES = new Set([
	"code.exe",
	"code - insiders.exe",
	"cursor.exe",
	"windsurf.exe",
	"zed.exe",
	"devenv.exe",
	"idea64.exe",
	"pycharm64.exe",
	"webstorm64.exe",
	"rider64.exe",
	"goland64.exe",
	"clion64.exe",
	"phpstorm64.exe",
	"datagrip64.exe",
	"studio64.exe",
	"sublime_text.exe",
	"notepad++.exe",
	"windowsterminal.exe",
	"wt.exe",
	"openconsole.exe",
	"cmd.exe",
	"powershell.exe",
	"pwsh.exe",
	"mintty.exe",
	"wezterm-gui.exe",
	"alacritty.exe",
	"figma.exe",
	"postman.exe",
	"insomnia.exe",
	"bruno.exe",
	"docker desktop.exe",
	"githubdesktop.exe",
	"tableplus.exe",
	"dbeaver.exe",
	"deep.exe",
]);

/** Comms apps, matched on the friendly name (so UWP-hosted apps resolve too). */
const COMMS_APPS = new Set([
	"whatsapp",
	"slack",
	"teams",
	"outlook",
	"mail",
	"thunderbird",
	"discord",
	"telegram",
	"signal",
	"zoom",
]);

const COMMS_SITES = [
	"mail.google.com",
	"web.whatsapp.com",
	"app.slack.com",
	"teams.microsoft.com",
	"teams.live.com",
	"outlook.office.com",
	"outlook.live.com",
	"outlook.office365.com",
	"discord.com",
	"web.telegram.org",
];

const WORK_SITES = [
	"github.com",
	"gitlab.com",
	"stackoverflow.com",
	"localhost",
	"127.0.0.1",
];

// --------------------------------------------------------------- title cleanup

/** Trailing browser branding (Edge puts a zero-width space between "Microsoft" and "Edge"). */
const BROWSER_SUFFIX: RegExp[] = [
	/\s+[-–—]\s+Google Chrome(?:\s+[-–—]\s+.*)?$/i,
	/\s+[-–—]\s+Microsoft​?\s*Edge(?:\s+(?:Beta|Dev|Canary))?$/i,
	/\s+[-–—]\s+(?:Mozilla\s+)?Firefox(?:\s+Private Browsing|\s+Developer Edition|\s+Nightly)?$/i,
	/\s+[-–—]\s+(?:Brave|Opera|Vivaldi|Chromium|Zen Browser|LibreWolf|Arc)$/i,
	/^(?:Mozilla\s+Firefox|Google Chrome|Microsoft​?\s*Edge|Brave)$/i,
];
/** Edge's profile segment left after removing the brand: "Page - Personal". */
const EDGE_PROFILE =
	/\s+[-–—]\s+(?:Personal|Work|School|Default|Profile \d+|\[?InPrivate\]?)$/i;

/** "Title and 3 more pages" (Edge) / "Title and 2 more tabs". */
const MORE_TABS = /\s+and\s+\d+\s+more\s+(?:pages?|tabs?)$/i;
/** Leading notification badge like "(3) " or "(99+) ". */
const BADGE = /^\(\d+\+?\)\s+/;

const EDITOR_SUFFIX: Record<string, RegExp> = {
	"code.exe": /\s+[-–—]\s+Visual Studio Code(?:\s+[-–—]\s+Insiders)?$/i,
	"code - insiders.exe":
		/\s+[-–—]\s+Visual Studio Code(?:\s+[-–—]\s+Insiders)?$/i,
	"cursor.exe": /\s+[-–—]\s+Cursor$/i,
	"windsurf.exe": /\s+[-–—]\s+Windsurf$/i,
	"devenv.exe": /\s+[-–—]\s+Microsoft Visual Studio.*$/i,
};
/** Unsaved-changes markers editors prefix to titles. */
const DIRTY = /^(?:●|•|\*)\s*/;

/** Well-known sites recognisable from a browser page title. Order matters. */
const TITLE_SITES: Array<[RegExp, string]> = [
	[/(?:^|[-–—|]\s*)YouTube(?:\s+Music)?$/i, "youtube.com"],
	[/(?:\s\/\s|^)X$/, "x.com"],
	[/\son X:\s/, "x.com"],
	[/(?:\s\/\s|^)Twitter$/, "x.com"],
	[/\s:\s+r\/\w+$|^r\/\w+$|(?:^|[-–—|]\s*)Reddit\b/i, "reddit.com"],
	[/(?:^|[-–—|]\s*)Gmail$/i, "mail.google.com"],
	[/^WhatsApp(?:\s+Web)?$/i, "web.whatsapp.com"],
	[/(?:^|[-–—|]\s*)Netflix$/i, "netflix.com"],
	[/(?:^|[-–—|]\s*)Twitch$/i, "twitch.tv"],
	[/(?:^|[-–—|•]\s*)Instagram(?:\s+photos and videos)?$/i, "instagram.com"],
	[/(?:^|[-–—|]\s*)Facebook$/i, "facebook.com"],
	[/(?:^|[-–—|]\s*)TikTok$/i, "tiktok.com"],
	[/(?:^|[-–—|]\s*|\s)Hacker News$/i, "news.ycombinator.com"],
	[/(?:^|[-–—|]\s*)LinkedIn$/i, "linkedin.com"],
	[/(?:^|[·|]\s*)GitHub$/i, "github.com"],
	[/(?:^|[-–—|]\s*)Stack Overflow$/i, "stackoverflow.com"],
	[/(?:^|[-–—|]\s*)Google Docs$/i, "docs.google.com"],
	[/(?:^|[-–—|]\s*)Google Sheets$/i, "docs.google.com"],
	[/(?:^|[-–—|]\s*)Google Calendar\b/i, "calendar.google.com"],
	[/(?:^|[-–—|]\s*)Slack$/i, "app.slack.com"],
	[/(?:^|[-–—|]\s*)ChatGPT$/i, "chatgpt.com"],
	[/(?:^|[-–—|]\s*)Claude$/i, "claude.ai"],
];

function titleCaseExe(exe: string): string {
	const base = exe
		.replace(/\.exe$/i, "")
		.replace(/[_-]+/g, " ")
		.trim();
	if (!base) return "Unknown";
	return base
		.split(/\s+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

const exeName = (exe: string) =>
	(exe.split(/[\\/]/).pop() ?? exe).trim().toLowerCase();

/** Friendly app name for UWP windows hosted by ApplicationFrameHost (title is all we have). */
function uwpName(title: string): string {
	const t = title.replace(BADGE, "").trim();
	if (/whatsapp/i.test(t)) return "WhatsApp";
	if (!t) return "Windows App";
	const parts = t.split(/\s+[-–—]\s+/);
	return parts[parts.length - 1]!.trim() || "Windows App";
}

function guessSite(title: string): string | null {
	for (const [re, site] of TITLE_SITES) if (re.test(title)) return site;
	return null;
}

/** Describe a raw sample: friendly app name, cleaned title, site, browser flag. */
export function describe(s: AppSample): Described {
	const exe = exeName(s.exe ?? "");
	const raw = (s.title ?? "").replace(/\s+/g, " ").trim();
	const browser = BROWSERS.has(exe);

	let app = FRIENDLY[exe];
	if (!app)
		app = exe === "applicationframehost.exe" ? uwpName(raw) : titleCaseExe(exe);

	let detail = raw;
	if (browser) {
		for (const re of BROWSER_SUFFIX) detail = detail.replace(re, "");
		if (exe === "msedge.exe") detail = detail.replace(EDGE_PROFILE, "");
		detail = detail.replace(MORE_TABS, "").replace(BADGE, "").trim();
	} else if (EDITOR_SUFFIX[exe]) {
		detail = detail.replace(EDITOR_SUFFIX[exe]!, "").replace(DIRTY, "").trim();
		if (/^Visual Studio Code$/i.test(detail)) detail = "";
	} else {
		// Generic: drop a trailing " - AppName" and a leading badge.
		const esc = app.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		detail = detail
			.replace(new RegExp(`\\s+[-–—|]\\s+${esc}$`, "i"), "")
			.replace(BADGE, "")
			.trim();
		if (detail.toLowerCase() === app.toLowerCase()) detail = "";
	}

	let site: string | null = null;
	if (s.domain) site = normalizeSite(s.domain);
	if (!site && browser) site = guessSite(detail);

	return { app, detail, site, browser };
}

// ------------------------------------------------------------------- sites

const HOST_RE =
	/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Normalise something a user typed into a bare domain: lower-case, no scheme,
 * no "www.", no port/path/query. "*.example.com" keeps its wildcard prefix.
 * Returns null when it isn't a plausible host.
 */
export function normalizeSite(input: string): string | null {
	let s = (input ?? "").trim().toLowerCase();
	if (!s || /\s/.test(s)) return null;
	let wildcard = false;
	const scheme = /^[a-z][a-z0-9+.-]*:\/\//.exec(s)?.[0] ?? "";
	s = s.slice(scheme.length);
	if (s.startsWith("*.")) {
		wildcard = true;
		s = s.slice(2);
	}
	let host: string;
	try {
		host = new URL(`http://${s}`).hostname;
	} catch {
		return null;
	}
	host = host.replace(/\.$/, "").replace(/^www\d*\./, "");
	if (!host) return null;
	if (!(host === "localhost" || IPV4_RE.test(host) || HOST_RE.test(host))) {
		return null;
	}
	return wildcard ? `*.${host}` : host;
}

/**
 * Does `domain` fall under `pattern`? "youtube.com" matches "youtube.com",
 * "www.youtube.com", "m.youtube.com" but not "notyoutube.com". "*.reddit.com"
 * matches any subdomain of reddit.com and reddit.com itself.
 */
export function matchesSite(domain: string, pattern: string): boolean {
	const d = normalizeSite(domain);
	const p = normalizeSite(pattern);
	if (!d || !p || d.startsWith("*.")) return false;
	const base = p.startsWith("*.") ? p.slice(2) : p;
	return d === base || d.endsWith(`.${base}`);
}

// ---------------------------------------------------------------- classify

const isSitePattern = (p: string) => p.includes(".") || p.startsWith("*");
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** App keyword match: an exe or the friendly name equals/starts with the keyword, or a word of the name does. */
function matchesApp(d: Described, keyword: string): boolean {
	const k = alnum(keyword);
	if (!k) return false;
	const exes = EXES_BY_NAME.get(d.app) ?? [];
	for (const exe of exes) {
		const base = alnum(exe.replace(/\.exe$/i, ""));
		if (base === k || base.startsWith(k)) return true;
	}
	const appNorm = alnum(d.app);
	if (appNorm === k || appNorm.startsWith(k)) return true;
	return d.app
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.some((w) => w === k);
}

/** Friendly name → exe names, so keywords like "msedge" still match "Edge". */
const EXES_BY_NAME = new Map<string, string[]>();
for (const [exe, name] of Object.entries(FRIENDLY)) {
	EXES_BY_NAME.set(name, [...(EXES_BY_NAME.get(name) ?? []), exe]);
}
const WORK_APPS = new Set([...WORK_EXES].map((e) => FRIENDLY[e]!));

/**
 * Classify a described sample. `distracting` / `work` entries are either domains
 * (contain a "." or start with "*.") matched against the site, or app keywords
 * matched against the exe / friendly name.
 *
 * Precedence: for a known site, a distracting site wins over everything; then user
 * work sites, comms sites, built-in work sites. Built-in work apps (IDEs, terminals,
 * Deep…) are always work. Then user work app keywords, distracting app keywords,
 * comms apps, else "other".
 */
export function classify(
	d: Described,
	rules: { distracting: string[]; work?: string[] },
): AppCategory {
	const distracting = rules.distracting ?? [];
	const work = rules.work ?? [];

	if (d.site) {
		const site = d.site;
		const hit = (list: string[]) =>
			list.some((p) => isSitePattern(p) && matchesSite(site, p));
		if (hit(distracting)) return "distraction";
		if (hit(work)) return "work";
		if (COMMS_SITES.some((p) => matchesSite(site, p))) return "comms";
		if (WORK_SITES.some((p) => matchesSite(site, p))) return "work";
	}

	if (!d.browser && WORK_APPS.has(d.app)) return "work";

	const appHit = (list: string[]) =>
		list.some((p) => !isSitePattern(p) && matchesApp(d, p));
	if (appHit(work)) return "work";
	if (appHit(distracting)) return "distraction";
	if (!d.browser && COMMS_APPS.has(d.app.toLowerCase())) return "comms";
	return "other";
}
