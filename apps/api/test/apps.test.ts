import { expect, describe as group, test } from "bun:test";
import {
	classify,
	DEFAULT_DISTRACTING,
	describe,
	matchesSite,
	normalizeSite,
} from "../src/lib/apps";
import { foregroundAvailable, foregroundWindow } from "../src/lib/foreground";

const rules = { distracting: DEFAULT_DISTRACTING };
const cat = (
	exe: string,
	title: string,
	r: { distracting: string[]; work?: string[] } = rules,
	domain?: string | null,
) => classify(describe({ exe, title, domain }), r);

group("describe: browsers", () => {
	test("Chrome suffix stripped", () => {
		expect(
			describe({ exe: "chrome.exe", title: "Pull requests - Google Chrome" }),
		).toEqual({
			app: "Chrome",
			detail: "Pull requests",
			site: null,
			browser: true,
		});
	});

	test("Chrome with trailing profile name", () => {
		expect(
			describe({ exe: "chrome.exe", title: "Docs - Google Chrome - Munya" })
				.detail,
		).toBe("Docs");
	});

	test("Edge suffix with profile and zero-width space", () => {
		const d = describe({
			exe: "msedge.exe",
			title: "Quarterly plan - Personal - Microsoft\u200b Edge",
		});
		expect(d.app).toBe("Edge");
		expect(d.detail).toBe("Quarterly plan");
	});

	test("Edge without profile keeps real title segments", () => {
		const d = describe({
			exe: "msedge.exe",
			title: "Lofi beats - YouTube - Microsoft Edge",
		});
		expect(d.detail).toBe("Lofi beats - YouTube");
		expect(d.site).toBe("youtube.com");
	});

	test("Edge 'and N more pages' and InPrivate", () => {
		expect(
			describe({
				exe: "msedge.exe",
				title: "Inbox and 3 more pages - Work - Microsoft\u200b Edge",
			}).detail,
		).toBe("Inbox");
		expect(
			describe({
				exe: "msedge.exe",
				title: "Search - [InPrivate] - Microsoft\u200b Edge",
			}).detail,
		).toBe("Search");
	});

	test("Firefox em-dash suffix", () => {
		const d = describe({
			exe: "firefox.exe",
			title: "MDN Web Docs — Mozilla Firefox",
		});
		expect(d).toMatchObject({
			app: "Firefox",
			detail: "MDN Web Docs",
			browser: true,
		});
		expect(
			describe({
				exe: "firefox.exe",
				title: "Secret — Mozilla Firefox Private Browsing",
			}).detail,
		).toBe("Secret");
	});

	test("Brave and bare browser titles", () => {
		expect(describe({ exe: "brave.exe", title: "News - Brave" }).detail).toBe(
			"News",
		);
		expect(describe({ exe: "chrome.exe", title: "Google Chrome" }).detail).toBe(
			"",
		);
	});

	test("full exe path and upper case are normalised", () => {
		const d = describe({
			exe: "C:\\Program Files\\Google\\Chrome\\Application\\CHROME.EXE",
			title: "x - Google Chrome",
		});
		expect(d.app).toBe("Chrome");
		expect(d.browser).toBe(true);
	});
});

group("describe: site guessing", () => {
	const site = (title: string, exe = "chrome.exe") =>
		describe({ exe, title }).site;

	test("YouTube", () => {
		expect(site("(3) Never Gonna Give You Up - YouTube - Google Chrome")).toBe(
			"youtube.com",
		);
		expect(site("YouTube - Google Chrome")).toBe("youtube.com");
	});

	test("notification badge stripped from detail", () => {
		expect(
			describe({ exe: "chrome.exe", title: "(12) Home / X - Google Chrome" })
				.detail,
		).toBe("Home / X");
	});

	test("X / Twitter", () => {
		expect(site("(3) Home / X - Google Chrome")).toBe("x.com");
		expect(site('Elon on X: "hello" / X - Google Chrome')).toBe("x.com");
		expect(site("X - Google Chrome")).toBe("x.com");
		expect(site("Home / Twitter - Google Chrome")).toBe("x.com");
		expect(site("Project X - Google Chrome")).toBeNull();
	});

	test("Reddit", () => {
		expect(site("Reddit - Dive into anything - Google Chrome")).toBe(
			"reddit.com",
		);
		expect(
			site("What editor do you use? : r/programming - Google Chrome"),
		).toBe("reddit.com");
		expect(site("r/typescript - Google Chrome")).toBe("reddit.com");
	});

	test("Gmail, WhatsApp Web, GitHub, Hacker News", () => {
		expect(site("Inbox (4) - me@gmail.com - Gmail - Google Chrome")).toBe(
			"mail.google.com",
		);
		expect(site("(2) WhatsApp - Google Chrome")).toBe("web.whatsapp.com");
		expect(site("mikeyny/deep: Focus app · GitHub - Google Chrome")).toBe(
			"github.com",
		);
		expect(site("Hacker News - Google Chrome")).toBe("news.ycombinator.com");
	});

	test("unknown site → null; non-browser never guesses", () => {
		expect(site("Some internal dashboard - Google Chrome")).toBeNull();
		expect(
			describe({ exe: "code.exe", title: "YouTube - Visual Studio Code" }).site,
		).toBeNull();
	});

	test("explicit domain wins and is normalised", () => {
		expect(
			describe({
				exe: "chrome.exe",
				title: "Watch - Google Chrome",
				domain: "https://WWW.YouTube.com/watch?v=1",
			}).site,
		).toBe("youtube.com");
	});
});

group("describe: apps", () => {
	test("VS Code titles", () => {
		expect(
			describe({
				exe: "Code.exe",
				title: "● apps.ts - planner-tracker - Visual Studio Code",
			}),
		).toEqual({
			app: "VS Code",
			detail: "apps.ts - planner-tracker",
			site: null,
			browser: false,
		});
		expect(
			describe({
				exe: "code.exe",
				title: "planner-tracker - Visual Studio Code",
			}).detail,
		).toBe("planner-tracker");
		expect(
			describe({ exe: "code.exe", title: "Visual Studio Code" }).detail,
		).toBe("");
		expect(
			describe({
				exe: "code.exe",
				title: "foo.ts - x - Visual Studio Code - Insiders",
			}).detail,
		).toBe("foo.ts - x");
	});

	test("Cursor", () => {
		expect(
			describe({ exe: "cursor.exe", title: "main.rs - deep - Cursor" }),
		).toMatchObject({
			app: "Cursor",
			detail: "main.rs - deep",
		});
	});

	test("friendly names", () => {
		const app = (exe: string) => describe({ exe, title: "" }).app;
		expect(app("windowsterminal.exe")).toBe("Terminal");
		expect(app("explorer.exe")).toBe("File Explorer");
		expect(app("WhatsApp.exe")).toBe("WhatsApp");
		expect(app("whatsapp.root.exe")).toBe("WhatsApp");
		expect(app("ms-teams.exe")).toBe("Teams");
		expect(app("olk.exe")).toBe("Outlook");
		expect(app("spotify.exe")).toBe("Spotify");
		expect(app("figma.exe")).toBe("Figma");
		expect(app("deep.exe")).toBe("Deep");
		expect(app("my_cool-tool.exe")).toBe("My Cool Tool");
		expect(app("leagueclient.exe")).toBe("Leagueclient");
		expect(app("")).toBe("Unknown");
	});

	test("generic ' - App' suffix stripped", () => {
		expect(
			describe({ exe: "slack.exe", title: "general (Channel) - Acme - Slack" })
				.detail,
		).toBe("general (Channel) - Acme");
		expect(describe({ exe: "spotify.exe", title: "Spotify" }).detail).toBe("");
	});

	test("UWP host uses the title", () => {
		expect(
			describe({ exe: "applicationframehost.exe", title: "WhatsApp" }).app,
		).toBe("WhatsApp");
		expect(
			describe({ exe: "applicationframehost.exe", title: "Calculator" }).app,
		).toBe("Calculator");
		expect(describe({ exe: "applicationframehost.exe", title: "" }).app).toBe(
			"Windows App",
		);
	});

	test("unicode titles survive", () => {
		expect(
			describe({
				exe: "chrome.exe",
				title: "Café ☕ 日本語 🎉 notes - Google Chrome",
			}).detail,
		).toBe("Café ☕ 日本語 🎉 notes");
		expect(
			describe({
				exe: "code.exe",
				title: "ñandú.ts — 项目 - Visual Studio Code",
			}).detail,
		).toBe("ñandú.ts — 项目");
	});
});

group("normalizeSite", () => {
	test("URLs and bare domains", () => {
		expect(normalizeSite("https://www.YouTube.com/watch?v=1")).toBe(
			"youtube.com",
		);
		expect(normalizeSite("youtube.com/")).toBe("youtube.com");
		expect(normalizeSite("  Reddit.com  ")).toBe("reddit.com");
		expect(normalizeSite("http://m.youtube.com:8080/x")).toBe("m.youtube.com");
		expect(normalizeSite("news.ycombinator.com")).toBe("news.ycombinator.com");
		expect(normalizeSite("localhost:3000")).toBe("localhost");
		expect(normalizeSite("127.0.0.1")).toBe("127.0.0.1");
		expect(normalizeSite("example.com.")).toBe("example.com");
	});

	test("wildcards kept", () => {
		expect(normalizeSite("*.Reddit.com")).toBe("*.reddit.com");
		expect(normalizeSite("https://*.reddit.com/r/x")).toBe("*.reddit.com");
	});

	test("invalid → null", () => {
		expect(normalizeSite("")).toBeNull();
		expect(normalizeSite("youtube")).toBeNull();
		expect(normalizeSite("not a domain")).toBeNull();
		expect(normalizeSite("http://")).toBeNull();
		expect(normalizeSite("-bad-.com")).toBeNull();
		expect(normalizeSite("a..b")).toBeNull();
	});
});

group("matchesSite", () => {
	test("subdomains match, look-alikes don't", () => {
		expect(matchesSite("youtube.com", "youtube.com")).toBe(true);
		expect(matchesSite("www.youtube.com", "youtube.com")).toBe(true);
		expect(matchesSite("m.youtube.com", "youtube.com")).toBe(true);
		expect(matchesSite("notyoutube.com", "youtube.com")).toBe(false);
		expect(matchesSite("youtube.com.evil.io", "youtube.com")).toBe(false);
		expect(matchesSite("youtube.com", "m.youtube.com")).toBe(false);
	});

	test("pattern may be a URL", () => {
		expect(matchesSite("www.reddit.com", "https://reddit.com/r/all")).toBe(
			true,
		);
	});

	test("wildcards", () => {
		expect(matchesSite("old.reddit.com", "*.reddit.com")).toBe(true);
		expect(matchesSite("a.b.reddit.com", "*.reddit.com")).toBe(true);
		expect(matchesSite("reddit.com", "*.reddit.com")).toBe(true);
		expect(matchesSite("notreddit.com", "*.reddit.com")).toBe(false);
	});

	test("garbage never matches", () => {
		expect(matchesSite("", "youtube.com")).toBe(false);
		expect(matchesSite("youtube.com", "")).toBe(false);
	});
});

group("classify", () => {
	test("IDEs, terminals, dev tools, Deep → work", () => {
		expect(cat("code.exe", "a.ts - x - Visual Studio Code")).toBe("work");
		expect(cat("cursor.exe", "Cursor")).toBe("work");
		expect(cat("windowsterminal.exe", "bun test")).toBe("work");
		expect(cat("pwsh.exe", "PowerShell")).toBe("work");
		expect(cat("figma.exe", "Design")).toBe("work");
		expect(cat("postman.exe", "Postman")).toBe("work");
		expect(cat("Docker Desktop.exe", "Docker Desktop")).toBe("work");
		expect(cat("deep.exe", "Deep")).toBe("work");
	});

	test("comms apps and sites", () => {
		expect(cat("slack.exe", "general - Slack")).toBe("comms");
		expect(cat("ms-teams.exe", "Chat | Microsoft Teams")).toBe("comms");
		expect(cat("whatsapp.exe", "WhatsApp")).toBe("comms");
		expect(cat("applicationframehost.exe", "WhatsApp")).toBe("comms");
		expect(cat("olk.exe", "Inbox - Outlook")).toBe("comms");
		expect(cat("discord.exe", "Discord")).toBe("comms");
		expect(cat("telegram.exe", "Telegram")).toBe("comms");
		expect(
			cat("chrome.exe", "Inbox (4) - me@gmail.com - Gmail - Google Chrome"),
		).toBe("comms");
		expect(cat("chrome.exe", "(2) WhatsApp - Google Chrome")).toBe("comms");
		expect(cat("chrome.exe", "x - Google Chrome", rules, "app.slack.com")).toBe(
			"comms",
		);
	});

	test("distracting sites in a browser", () => {
		expect(cat("chrome.exe", "Cats - YouTube - Google Chrome")).toBe(
			"distraction",
		);
		expect(
			cat("msedge.exe", "Home / X - Personal - Microsoft\u200b Edge"),
		).toBe("distraction");
		expect(cat("firefox.exe", "r/aww — Mozilla Firefox")).toBe("distraction");
		expect(cat("chrome.exe", "Watch", rules, "m.youtube.com")).toBe(
			"distraction",
		);
	});

	test("browser with unknown site → other; known work site → work", () => {
		expect(cat("chrome.exe", "Some dashboard - Google Chrome")).toBe("other");
		expect(
			cat("chrome.exe", "Issues · mikeyny/deep · GitHub - Google Chrome"),
		).toBe("work");
		expect(cat("chrome.exe", "Local", rules, "localhost")).toBe("work");
	});

	test("everything else → other", () => {
		expect(cat("explorer.exe", "Downloads")).toBe("other");
		expect(cat("spotify.exe", "Spotify")).toBe("other");
		expect(cat("notepad.exe", "todo.txt - Notepad")).toBe("other");
	});

	test("user app keywords mark apps as distractions", () => {
		const r = { distracting: [...DEFAULT_DISTRACTING, "steam", "Spotify"] };
		expect(cat("spotify.exe", "Spotify", r)).toBe("distraction");
		expect(cat("steamwebhelper.exe", "Steam", r)).toBe("distraction");
		expect(cat("steam.exe", "Steam", r)).toBe("distraction");
		const lol = { distracting: ["league"] };
		expect(cat("LeagueClientUx.exe", "League of Legends", lol)).toBe(
			"distraction",
		);
		// keyword matches whole words/prefixes only: "x" must not hit "File Explorer"
		expect(cat("explorer.exe", "Downloads", { distracting: ["x"] })).toBe(
			"other",
		);
		// keyword can name the exe even when the friendly name differs
		expect(
			cat("msedge.exe", "Page - Microsoft Edge", { distracting: ["msedge"] }),
		).toBe("distraction");
	});

	test("distracting never overrides an IDE", () => {
		const r = { distracting: ["code", "vs code", "youtube.com", "cursor"] };
		expect(cat("code.exe", "YouTube - Visual Studio Code", r)).toBe("work");
		expect(cat("cursor.exe", "Cursor", r)).toBe("work");
	});

	test("distracting site beats comms and user work sites", () => {
		expect(
			cat("chrome.exe", "Inbox - Gmail - Google Chrome", {
				distracting: ["mail.google.com"],
			}),
		).toBe("distraction");
		expect(
			cat(
				"chrome.exe",
				"x",
				{ distracting: ["youtube.com"], work: ["youtube.com"] },
				"youtube.com",
			),
		).toBe("distraction");
	});

	test("user work patterns: sites and apps", () => {
		const r = {
			distracting: DEFAULT_DISTRACTING,
			work: ["*.atlassian.net", "notion", "linear.app"],
		};
		expect(cat("chrome.exe", "Board", r, "acme.atlassian.net")).toBe("work");
		expect(cat("chrome.exe", "My issues", r, "https://linear.app/acme")).toBe(
			"work",
		);
		expect(cat("notion.exe", "Roadmap", r)).toBe("work");
		expect(cat("notion.exe", "Roadmap")).toBe("other");
		// user work keyword beats a distracting keyword for apps
		expect(
			cat("spotify.exe", "Focus", {
				distracting: ["spotify"],
				work: ["spotify"],
			}),
		).toBe("work");
	});

	test("wildcard distracting patterns", () => {
		const r = { distracting: ["*.reddit.com"] };
		expect(cat("chrome.exe", "x", r, "old.reddit.com")).toBe("distraction");
		expect(cat("chrome.exe", "x", r, "notreddit.com")).toBe("other");
	});

	test("DEFAULT_DISTRACTING is a short list of valid domains", () => {
		expect(DEFAULT_DISTRACTING.length).toBeLessThanOrEqual(12);
		for (const d of DEFAULT_DISTRACTING) expect(normalizeSite(d)).toBe(d);
	});
});

group("foreground (smoke)", () => {
	test("never throws; returns null or a well-formed sample", () => {
		expect(typeof foregroundAvailable).toBe("boolean");
		const w = foregroundWindow();
		if (w !== null) {
			expect(typeof w.exe).toBe("string");
			expect(typeof w.title).toBe("string");
			expect(typeof w.pid).toBe("number");
			expect(w.path === null || typeof w.path === "string").toBe(true);
			expect(w.exe).toBe(w.exe.toLowerCase());
		}
		if (!foregroundAvailable) expect(w).toBeNull();
	});
});
