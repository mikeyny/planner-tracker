import type { TimerMode } from "./timer";

export interface Settings {
	/** Daily deep-work target in minutes. */
	dailyTargetMin: number;
	defaultMode: TimerMode;
	timeboxMin: number;
	workdayStart: string;
	shutdownTime: string;
	/** Pause a running session after this many minutes without keyboard/mouse input. */
	idlePauseMin: number;
	/** Offer to end the session when away at least this long. */
	idleEndMin: number;
	/** What happens when a linked folder is opened in VS Code with no session running. */
	vscodeStart: "ask" | "auto" | "off";
	/** Pause the session when its project's VS Code window closes. */
	vscodeClosePause: boolean;
	/** Offer to switch the session when you edit a different project. */
	vscodeSwitchPrompt: boolean;
	chimeEvery15: boolean;
	autoMiniTimer: boolean;
	notifications: boolean;
	sound: "off" | "brown" | "pink" | "rain";
	soundVolume: number;
	/** Whisper language code, or "auto". */
	speechLanguage: string;
	/** Folder scanned by "Find projects" for repos. */
	projectsRoot: string;
	/** Keep this many daily database backups. */
	backupsKeep: number;
	/** Record which app and window is in front (stored on this PC only). */
	windowTracking: boolean;
	/** Delete window activity older than this many days. */
	windowRetentionDays: number;
	/** Sites and apps that count as distractions ("youtube.com", "steam"). */
	distracting: string[];
	/** Nudge when a distraction stays in front during a focus session. */
	driftNudge: boolean;
	/** The browser extension blocks distracting sites during focus sessions. */
	blockSites: boolean;
	/** Voice check-ins with the coach: when a focus session starts, and when it ends. */
	coachCheckins: "off" | "start" | "both";
	/** Gemini Live voice name. */
	coachVoice: string;
}

export const DEFAULT_DISTRACTING = [
	"youtube.com",
	"x.com",
	"twitter.com",
	"reddit.com",
	"instagram.com",
	"facebook.com",
	"tiktok.com",
	"netflix.com",
	"twitch.tv",
	"news.ycombinator.com",
];

export const COACH_VOICES = [
	"Kore",
	"Puck",
	"Charon",
	"Aoede",
	"Fenrir",
	"Leda",
	"Orus",
	"Zephyr",
] as const;

export const DEFAULT_SETTINGS: Settings = {
	dailyTargetMin: 210,
	defaultMode: "deep50",
	timeboxMin: 60,
	workdayStart: "08:30",
	shutdownTime: "17:30",
	idlePauseMin: 10,
	idleEndMin: 20,
	vscodeStart: "ask",
	vscodeClosePause: true,
	vscodeSwitchPrompt: true,
	chimeEvery15: false,
	autoMiniTimer: true,
	notifications: true,
	sound: "off",
	soundVolume: 0.35,
	speechLanguage: "en",
	projectsRoot: "",
	backupsKeep: 14,
	windowTracking: true,
	windowRetentionDays: 30,
	distracting: DEFAULT_DISTRACTING,
	driftNudge: true,
	blockSites: true,
	coachCheckins: "off",
	coachVoice: "Kore",
};
