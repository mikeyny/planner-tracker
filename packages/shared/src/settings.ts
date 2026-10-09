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
}

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
};
