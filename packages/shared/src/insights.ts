import type { Energy, ProjectTime } from "./types";

export interface WeekDay {
	date: string;
	focusSec: number;
	perProject: ProjectTime[];
}

export interface WeekProject extends ProjectTime {
	/** Weekly target in minutes, if the project has one. */
	targetMin: number | null;
}

export interface WeekStats {
	/** Monday, YYYY-MM-DD */
	start: string;
	/** Sunday, YYYY-MM-DD */
	end: string;
	focusSec: number;
	/** Sum of daily targets for the weekdays. */
	targetSec: number;
	sessions: number;
	tasksDone: number;
	urges: number;
	interruptions: number;
	/** Average project switches per day that had focus time. */
	switchesPerDay: number;
	longestSessionSec: number;
	/** Days that hit the daily target. */
	daysOnTarget: number;
	days: WeekDay[];
	perProject: WeekProject[];
	/** Focus seconds by the energy type of the task worked on. */
	energy: Record<Energy | "none", number>;
	/** Urges + interruptions by hour of day (0–23). */
	distractionsByHour: number[];
	/** Most frequent distraction notes (non-default texts). */
	topDistractions: { text: string; count: number }[];
}

export interface HeatCell {
	/** 0 = Monday … 6 = Sunday */
	dow: number;
	hour: number;
	focusSec: number;
	/** Average 1–5 focus rating of sessions in this slot, if any were rated. */
	avgRating: number | null;
	sessions: number;
}

export interface Heatmap {
	weeks: number;
	cells: HeatCell[];
	/** Best hours by focus time, e.g. [9, 10, 14] */
	bestHours: number[];
}

export interface TimesheetRow {
	date: string;
	projectId: number | null;
	project: string;
	client: string | null;
	task: string;
	minutes: number;
	rate: number | null;
	amount: number | null;
}

export interface Timesheet {
	from: string;
	to: string;
	rows: TimesheetRow[];
	totalMinutes: number;
	totalAmount: number | null;
}

export interface WeeklyReviewData {
	wentWell?: string;
	change?: string;
	focusNext?: string;
	/** Weekly targets set for next week, by project id (minutes). */
	budgets?: Record<string, number>;
}

export interface WeeklyReview {
	periodStart: string;
	data: WeeklyReviewData;
	aiSummary: string | null;
	completedAt: string | null;
}

export interface DiscoveredProject {
	name: string;
	path: string;
	kind: "git" | "package";
	modifiedAt: string;
}

export interface Commit {
	projectId: number;
	color: string;
	hash: string;
	subject: string;
	/** ISO time */
	at: string;
}

export interface BackupInfo {
	file: string;
	path: string;
	bytes: number;
	createdAt: string;
}

/** Monday of the week containing `date` (local), as YYYY-MM-DD. */
export function mondayOf(date: string): string {
	const d = new Date(`${date}T12:00:00`);
	const dow = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - dow);
	return isoDay(d);
}

export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00`);
	d.setDate(d.getDate() + days);
	return isoDay(d);
}

function isoDay(d: Date) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type AppCategory = "work" | "comms" | "distraction" | "other";

export interface AppUsageItem {
	/** Site domain for browsers when known, else the app name. */
	label: string;
	app: string;
	site: string | null;
	category: AppCategory;
	sec: number;
	/** Seconds of it during focus sessions. */
	focusSec: number;
}

export interface AppUsage {
	date: string;
	/** Seconds at the screen with tracking on. */
	totalSec: number;
	byCategory: Record<AppCategory, number>;
	/** Top apps and sites, longest first. */
	items: AppUsageItem[];
	/** Seconds at the screen during focus sessions. */
	focusSec: number;
	/** Of those, seconds on distractions. */
	offTaskSec: number;
	/** Times you switched app or site during focus, per focused hour. */
	switchesPerHour: number | null;
	/** Longest unbroken stretch on work apps during focus, in seconds. */
	longestWorkSec: number;
}
