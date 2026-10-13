import type { AppCategory, AppUsage, AppUsageItem } from "@deep/shared";

export interface SpanLite {
	app: string;
	site: string | null;
	category: string;
	startedAt: string;
	sec: number;
	sessionId: number | null;
}

const CATEGORIES: AppCategory[] = ["work", "comms", "distraction", "other"];
const asCategory = (c: string): AppCategory =>
	(CATEGORIES as string[]).includes(c) ? (c as AppCategory) : "other";

/** Roll window spans (oldest first) up into a day's app usage. */
export function summarizeUsage(
	date: string,
	spans: SpanLite[],
	top = 12,
): AppUsage {
	const byCategory: Record<AppCategory, number> = {
		work: 0,
		comms: 0,
		distraction: 0,
		other: 0,
	};
	const items = new Map<string, AppUsageItem>();
	let totalSec = 0;
	let focusSec = 0;
	let offTaskSec = 0;
	let switches = 0;
	let longestWorkSec = 0;
	let run = 0;
	let prev = null as { label: string; sessionId: number | null } | null;

	for (const s of spans) {
		const category = asCategory(s.category);
		const label = s.site ?? s.app;
		totalSec += s.sec;
		byCategory[category] += s.sec;
		const item = items.get(label) ?? {
			label,
			app: s.app,
			site: s.site,
			category,
			sec: 0,
			focusSec: 0,
		};
		item.sec += s.sec;
		if (s.sessionId) item.focusSec += s.sec;
		items.set(label, item);

		if (s.sessionId) {
			focusSec += s.sec;
			if (category === "distraction") offTaskSec += s.sec;
			if (prev?.sessionId === s.sessionId && prev.label !== label && s.sec >= 5)
				switches++;
			run = category === "work" ? run + s.sec : 0;
			longestWorkSec = Math.max(longestWorkSec, run);
		} else run = 0;
		if (s.sec >= 5 || !prev) prev = { label, sessionId: s.sessionId };
	}

	return {
		date,
		totalSec,
		byCategory,
		items: [...items.values()].sort((a, b) => b.sec - a.sec).slice(0, top),
		focusSec,
		offTaskSec,
		switchesPerHour:
			focusSec >= 600
				? Math.round((switches / (focusSec / 3600)) * 10) / 10
				: null,
		longestWorkSec,
	};
}
