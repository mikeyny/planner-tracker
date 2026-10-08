import type { ActiveSession } from "./types";

export type TimerMode =
	| "pomodoro"
	| "deep50"
	| "deep90"
	| "flowtime"
	| "timebox"
	| "just5";

export interface TimerModeSpec {
	label: string;
	short: string;
	/** Work length in minutes. null = open-ended (Flowtime). */
	workMin: number | null;
	breakMin: number;
	hint: string;
}

export const TIMER_MODES: Record<TimerMode, TimerModeSpec> = {
	pomodoro: {
		label: "Pomodoro",
		short: "25/5",
		workMin: 25,
		breakMin: 5,
		hint: "Good for tasks you're avoiding",
	},
	deep50: {
		label: "Deep block",
		short: "50/10",
		workMin: 50,
		breakMin: 10,
		hint: "Default for focused work",
	},
	deep90: {
		label: "Deep block",
		short: "90/20",
		workMin: 90,
		breakMin: 20,
		hint: "For hard problems",
	},
	flowtime: {
		label: "Flowtime",
		short: "open",
		workMin: null,
		breakMin: 0,
		hint: "No bell. Break = work ÷ 5",
	},
	timebox: {
		label: "Timebox",
		short: "custom",
		workMin: 60,
		breakMin: 10,
		hint: "Give it a fixed budget",
	},
	just5: {
		label: "Just 5 min",
		short: "5",
		workMin: 5,
		breakMin: 0,
		hint: "Lowest-effort start",
	},
};

export const TIMER_MODE_ORDER: TimerMode[] = [
	"deep50",
	"pomodoro",
	"deep90",
	"flowtime",
	"timebox",
	"just5",
];

/** Long break after this many pomodoros in a row. */
export const POMODORO_LONG_EVERY = 4;
export const POMODORO_LONG_BREAK_MIN = 15;

/** Seconds of active (non-paused) time in a session at `now`. */
export function elapsedSec(s: ActiveSession, now: number = Date.now()): number {
	const end = s.endedAt ? Date.parse(s.endedAt) : now;
	let total = (end - Date.parse(s.startedAt)) / 1000 - s.pausedSec;
	if (s.pausedAt) total -= (end - Date.parse(s.pausedAt)) / 1000;
	return Math.max(0, Math.floor(total));
}

/** Seconds left, negative when overtime. null for open-ended sessions. */
export function remainingSec(
	s: ActiveSession,
	now: number = Date.now(),
): number | null {
	if (s.plannedSec == null) return null;
	return s.plannedSec - elapsedSec(s, now);
}

/** Suggested break length for a finished focus session, in minutes. */
export function suggestedBreakMin(
	mode: TimerMode,
	workedSec: number,
	pomodorosToday: number,
): number {
	if (mode === "flowtime") return Math.max(3, Math.round(workedSec / 60 / 5));
	if (mode === "pomodoro")
		return pomodorosToday > 0 && pomodorosToday % POMODORO_LONG_EVERY === 0
			? POMODORO_LONG_BREAK_MIN
			: TIMER_MODES.pomodoro.breakMin;
	const spec = TIMER_MODES[mode];
	if (spec.breakMin > 0) return spec.breakMin;
	return Math.max(3, Math.round(workedSec / 60 / 5));
}

/** 1499 -> "24:59", -75 -> "+01:15", 3725 -> "1:02:05" */
export function formatClock(sec: number): string {
	const neg = sec < 0;
	const s = Math.abs(Math.round(sec));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const r = s % 60;
	const mm = String(m).padStart(2, "0");
	const ss = String(r).padStart(2, "0");
	const body = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
	return neg ? `+${body}` : body;
}

/** 95 -> "1h35", 40 -> "40m", 0 -> "0m" */
export function formatMinutes(min: number): string {
	const m = Math.max(0, Math.round(min));
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	const r = m % 60;
	return `${h}h${String(r).padStart(2, "0")}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** "17:30" -> 1050 */
export function hhmmToMin(hhmm: string): number {
	const [h = "0", m = "0"] = hhmm.split(":");
	return Number(h) * 60 + Number(m);
}

/** 1050 -> "17:30" */
export function minToHhmm(min: number): string {
	const h = Math.floor(min / 60) % 24;
	const m = Math.round(min % 60);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
