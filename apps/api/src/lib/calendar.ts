import { calendars, db, timeBlocks } from "@deep/db";
import { addDays, localDate } from "@deep/shared";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { changed } from "./bus";
import { type CalendarOccurrence, parseCalendar } from "./ics";
import { startOfLocalDay } from "./state";

/** Sync this window of days around today. */
const DAYS_BACK = 1;
const DAYS_AHEAD = 14;
const SYNC_EVERY_MS = 10 * 60_000;

export type CalendarRow = typeof calendars.$inferSelect;

export async function fetchFeed(url: string): Promise<string> {
	// Google shows "webcal://" for some feeds; it's plain HTTPS underneath.
	const href = url.replace(/^webcal:\/\//i, "https://");
	let res: Response;
	try {
		res = await fetch(href, {
			signal: AbortSignal.timeout(20_000),
			headers: { Accept: "text/calendar, */*" },
		});
	} catch (err) {
		throw new Error(
			`Couldn't download the calendar (${err instanceof Error ? err.message : String(err)}). Check your internet connection.`,
		);
	}
	if (res.status === 404 || res.status === 403 || res.status === 401)
		throw new Error(
			"The calendar address was refused. In Google Calendar, copy the “Secret address in iCal format” again.",
		);
	if (!res.ok) throw new Error(`The calendar server answered ${res.status}.`);
	const text = await res.text();
	if (!text.includes("BEGIN:VCALENDAR"))
		throw new Error(
			"That address isn't an iCal calendar. Use the “Secret address in iCal format” from Google Calendar's settings.",
		);
	return text;
}

/** Local minutes-since-midnight pieces of an occurrence, one per day it touches. */
export function toDayBlocks(
	o: CalendarOccurrence,
	from: string,
	to: string,
): Array<{ date: string; startMin: number; durationMin: number }> {
	const out: Array<{ date: string; startMin: number; durationMin: number }> =
		[];
	const start = Date.parse(o.start);
	const end = Date.parse(o.end);
	for (let d = from; d <= to; d = addDays(d, 1)) {
		const dayStart = Date.parse(startOfLocalDay(d));
		const dayEnd = Date.parse(startOfLocalDay(addDays(d, 1)));
		const s = Math.max(start, dayStart);
		const e = Math.min(end, dayEnd);
		if (e - s < 60_000) continue;
		out.push({
			date: d,
			startMin: Math.round((s - dayStart) / 60_000),
			durationMin: Math.max(5, Math.round((e - s) / 60_000)),
		});
	}
	return out;
}

/** Download one calendar and replace its meeting blocks for the sync window. */
export async function syncCalendar(cal: CalendarRow) {
	const today = localDate();
	const from = addDays(today, -DAYS_BACK);
	const to = addDays(today, DAYS_AHEAD);
	try {
		const text = await fetchFeed(cal.url);
		const parsed = parseCalendar(text, {
			from: new Date(startOfLocalDay(from)),
			to: new Date(startOfLocalDay(addDays(to, 1))),
			// A Google feed is named after its owner's email: skip meetings they declined.
			selfEmail: cal.name.includes("@") ? cal.name : null,
		});
		const rows = parsed.occurrences
			.filter((o) => !o.allDay)
			.flatMap((o) =>
				toDayBlocks(o, from, to).map((b) => ({
					...b,
					title: o.title.slice(0, 200),
					kind: "meeting",
					source: "calendar",
					calendarId: cal.id,
					externalId: o.uid.slice(0, 500),
					url: o.url,
					taskId: null,
					projectId: null,
				})),
			);
		await db.transaction(async (tx) => {
			await tx
				.delete(timeBlocks)
				.where(
					and(
						eq(timeBlocks.calendarId, cal.id),
						eq(timeBlocks.source, "calendar"),
						gte(timeBlocks.date, from),
						lte(timeBlocks.date, to),
					),
				);
			if (rows.length) await tx.insert(timeBlocks).values(rows);
			await tx
				.update(calendars)
				.set({
					lastSyncAt: new Date().toISOString(),
					lastError: null,
					eventCount: rows.length,
				})
				.where(eq(calendars.id, cal.id));
		});
		return { ok: true as const, events: rows.length, name: parsed.name };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db
			.update(calendars)
			.set({ lastError: message })
			.where(eq(calendars.id, cal.id));
		return { ok: false as const, error: message };
	}
}

export async function syncAll() {
	const cals = await db.query.calendars.findMany({
		where: eq(calendars.enabled, true),
		orderBy: asc(calendars.id),
	});
	const results = [];
	for (const cal of cals) results.push(await syncCalendar(cal));
	if (cals.length) changed("calendar", "day");
	return results;
}

/** Remove a calendar's blocks (when it's deleted or switched off). */
export async function clearCalendarBlocks(calendarId: number) {
	await db
		.delete(timeBlocks)
		.where(
			and(
				eq(timeBlocks.calendarId, calendarId),
				eq(timeBlocks.source, "calendar"),
			),
		);
}

export function startCalendarJob() {
	const run = () =>
		syncAll().catch((err) => console.error("[calendar] sync failed:", err));
	setTimeout(run, 15_000);
	setInterval(run, SYNC_EVERY_MS);
}
