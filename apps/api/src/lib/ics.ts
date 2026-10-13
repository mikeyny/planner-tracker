/**
 * iCalendar (.ics) feed → concrete event occurrences for a date range.
 *
 * Built for Google Calendar's "Secret address in iCal format" feed, used to
 * draw meetings on the day timeline. Pure: no I/O, no globals mutated.
 *
 * Parsing and RRULE expansion are delegated to `ical.js` (Mozilla). Time zone
 * handling:
 *  - TZIDs with a VTIMEZONE in the feed are resolved by ical.js from that
 *    definition (Google always ships these).
 *  - A TZID with no VTIMEZONE falls back to the IANA zone of the same name via
 *    `Intl` (also tries the trailing "Area/City" of prefixed ids such as
 *    "/mozilla.org/.../Europe/Berlin"). Unknown ids (e.g. Windows names like
 *    "Eastern Standard Time") are treated as floating.
 *  - Floating times (no TZID, no "Z") and all-day dates use the machine's
 *    local zone; all-day events span local midnight to local midnight.
 */
import ICAL from "ical.js";

type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalTime = InstanceType<typeof ICAL.Time>;
type IcalProperty = InstanceType<typeof ICAL.Property>;

export interface CalendarOccurrence {
	/** Event UID; recurring occurrences get `@<occurrence start ISO>` appended. */
	uid: string;
	/** SUMMARY, fallback "Busy". */
	title: string;
	/** ISO 8601 UTC instant. */
	start: string;
	/** ISO 8601 UTC instant (DTEND, or DTSTART + DURATION, or +30 min). */
	end: string;
	/** DATE-valued DTSTART. */
	allDay: boolean;
	location: string | null;
	/** Meeting link (X-GOOGLE-CONFERENCE, Meet/Zoom/Teams link, or URL). */
	url: string | null;
}

export interface ParseCalendarOptions {
	from: Date;
	to: Date;
	/** Your own address: events you declined (PARTSTAT=DECLINED) are skipped. */
	selfEmail?: string | null;
}

/** Max occurrences emitted per recurring series. */
const MAX_OCCURRENCES_PER_SERIES = 1000;
/** Max RRULE iterations per series (guards FREQ=MINUTELY since 1970 etc.). */
const MAX_ITERATIONS_PER_SERIES = 100_000;
const DEFAULT_TIMED_DURATION_MS = 30 * 60_000;

const MEETING_LINK_RE =
	/https:\/\/(?:meet\.google\.com|(?:[a-z0-9-]+\.)*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/[^\s<>"'()[\]{}]+/i;

export function parseCalendar(
	icsText: string,
	opts: ParseCalendarOptions,
): { name: string | null; occurrences: CalendarOccurrence[] } {
	const root = parseRoot(icsText);
	const fromMs = opts.from.getTime();
	const toMs = opts.to.getTime();
	const self = opts.selfEmail?.trim().toLowerCase() || null;

	const name = safe(() => textValue(root, "x-wr-calname")) ?? null;

	// Group VEVENTs by UID: one master (no RECURRENCE-ID) + overrides.
	const series = new Map<
		string,
		{ master: IcalComponent | null; overrides: IcalComponent[] }
	>();
	let anon = 0;
	for (const ev of root.getAllSubcomponents("vevent")) {
		const uid = safe(() => textValue(ev, "uid")) || `no-uid-${++anon}`;
		let entry = series.get(uid);
		if (!entry) {
			entry = { master: null, overrides: [] };
			series.set(uid, entry);
		}
		if (ev.hasProperty("recurrence-id")) entry.overrides.push(ev);
		else if (!entry.master) entry.master = ev;
	}

	const out: CalendarOccurrence[] = [];
	const ctx: Ctx = { fromMs, toMs, self };
	for (const [uid, { master, overrides }] of series) {
		try {
			expandSeries(uid, master, overrides, ctx, out);
		} catch {
			// A malformed event must never take the whole feed down.
		}
	}

	out.sort((a, b) =>
		a.start === b.start
			? a.title.localeCompare(b.title)
			: a.start < b.start
				? -1
				: 1,
	);
	return { name, occurrences: out };
}

// ---------------------------------------------------------------------------

interface Ctx {
	fromMs: number;
	toMs: number;
	self: string | null;
}

function parseRoot(icsText: string): IcalComponent {
	if (typeof icsText !== "string" || !/BEGIN:VCALENDAR/i.test(icsText)) {
		throw new Error("Not an iCalendar feed (no BEGIN:VCALENDAR found)");
	}
	let jcal: unknown;
	try {
		jcal = ICAL.parse(icsText);
	} catch {
		// Retry after dropping content lines that can't be parsed, so one
		// broken line doesn't lose the whole calendar.
		try {
			jcal = ICAL.parse(sanitize(icsText));
		} catch (err) {
			throw new Error(
				`Could not parse iCalendar feed: ${(err as Error).message}`,
			);
		}
	}
	// ICAL.parse returns an array of components when several roots exist.
	const first = Array.isArray(jcal) && Array.isArray(jcal[0]) ? jcal[0] : jcal;
	const root = new ICAL.Component(first as unknown[]);
	if (root.name !== "vcalendar") {
		throw new Error("Not an iCalendar feed (root is not a VCALENDAR)");
	}
	return root;
}

/** Unfold, then keep only lines that look like `NAME[;params]:value`. */
function sanitize(text: string): string {
	const unfolded = text.replace(/\r?\n[ \t]/g, "");
	return unfolded
		.split(/\r?\n/)
		.filter((line) => /^[A-Za-z0-9-]+(;[^:]*)?:/.test(line))
		.filter((line) => {
			try {
				ICAL.parse(`BEGIN:VCALENDAR\r\n${line}\r\nEND:VCALENDAR`);
				return true;
			} catch {
				return /^(BEGIN|END):/i.test(line);
			}
		})
		.join("\r\n");
}

function expandSeries(
	uid: string,
	master: IcalComponent | null,
	overrides: IcalComponent[],
	ctx: Ctx,
	out: CalendarOccurrence[],
): void {
	// Overrides (moved / cancelled / edited single instances) are emitted on
	// their own, and suppress the generated instance at their RECURRENCE-ID.
	const overridden = new Set<number>();
	for (const ov of overrides) {
		try {
			const rid = ov.getFirstProperty("recurrence-id");
			if (rid) {
				const ms = propToMs(rid);
				if (ms !== null) overridden.add(ms);
			}
			const occ = buildSingle(ov, `${uid}`, ctx, true);
			if (occ) out.push(occ);
		} catch {
			// skip malformed override
		}
	}

	if (!master) return;
	const isRecurring =
		master.hasProperty("rrule") || master.hasProperty("rdate");
	if (!isRecurring) {
		const occ = buildSingle(master, uid, ctx, false);
		if (occ) out.push(occ);
		return;
	}
	if (!isVisible(master, ctx.self)) return;

	const dtstartProp = master.getFirstProperty("dtstart");
	if (!dtstartProp) return;
	const dtstart = dtstartProp.getFirstValue() as IcalTime;
	const tzid = tzidOf(dtstartProp);
	const allDay = dtstart.isDate;
	const dur = durationOf(master, dtstart, tzid);
	const meta = metaOf(master);

	const exdates = new Set<number>();
	for (const p of master.getAllProperties("exdate")) {
		const ptz = tzidOf(p) ?? tzid;
		for (const v of p.getValues() as IcalTime[]) {
			const ms = timeToMs(v, ptz);
			if (ms !== null) exdates.add(ms);
		}
	}

	const iter = new ICAL.Event(master).iterator();
	let emitted = 0;
	for (let i = 0; i < MAX_ITERATIONS_PER_SERIES; i++) {
		const next = iter.next();
		if (!next) break;
		const startMs = timeToMs(next, tzid);
		if (startMs === null) break;
		if (startMs >= ctx.toMs) break;
		if (exdates.has(startMs) || overridden.has(startMs)) continue;
		const endMs = addDuration(next, startMs, dur);
		if (endMs <= ctx.fromMs) continue;
		const start = new Date(startMs).toISOString();
		out.push({
			uid: `${uid}@${start}`,
			title: meta.title,
			start,
			end: new Date(endMs).toISOString(),
			allDay,
			location: meta.location,
			url: meta.url,
		});
		if (++emitted >= MAX_OCCURRENCES_PER_SERIES) break;
	}
}

/** A non-recurring event, or a single RECURRENCE-ID override. */
function buildSingle(
	ev: IcalComponent,
	uid: string,
	ctx: Ctx,
	isOverride: boolean,
): CalendarOccurrence | null {
	if (!isVisible(ev, ctx.self)) return null;
	const dtstartProp = ev.getFirstProperty("dtstart");
	if (!dtstartProp) return null;
	const dtstart = dtstartProp.getFirstValue() as IcalTime;
	const tzid = tzidOf(dtstartProp);
	const startMs = timeToMs(dtstart, tzid);
	if (startMs === null) return null;

	let endMs: number | null = null;
	const dtendProp = ev.getFirstProperty("dtend");
	if (dtendProp) endMs = propToMs(dtendProp);
	if (endMs === null) {
		endMs = addDuration(dtstart, startMs, durationOf(ev, dtstart, tzid));
	}
	if (endMs < startMs) endMs = startMs;
	if (startMs >= ctx.toMs || endMs <= ctx.fromMs) return null;
	// Zero-length events still show up if they start inside the range.
	if (endMs === startMs && startMs < ctx.fromMs) return null;

	const meta = metaOf(ev);
	const start = new Date(startMs).toISOString();
	return {
		uid: isOverride ? `${uid}@${start}` : uid,
		title: meta.title,
		start,
		end: new Date(endMs).toISOString(),
		allDay: dtstart.isDate,
		location: meta.location,
		url: meta.url,
	};
}

/** Not cancelled, not "free" (TRANSPARENT), not declined by `self`. */
function isVisible(ev: IcalComponent, self: string | null): boolean {
	const status = safe(() => textValue(ev, "status"));
	if (status?.toUpperCase() === "CANCELLED") return false;
	const transp = safe(() => textValue(ev, "transp"));
	if (transp?.toUpperCase() === "TRANSPARENT") return false;
	if (self) {
		for (const att of ev.getAllProperties("attendee")) {
			const v = String(att.getFirstValue() ?? "")
				.replace(/^mailto:/i, "")
				.trim()
				.toLowerCase();
			if (v !== self) continue;
			const partstat = String(att.getParameter("partstat") ?? "");
			if (partstat.toUpperCase() === "DECLINED") return false;
		}
	}
	return true;
}

function metaOf(ev: IcalComponent): {
	title: string;
	location: string | null;
	url: string | null;
} {
	const title = safe(() => textValue(ev, "summary"))?.trim() || "Busy";
	const location = safe(() => textValue(ev, "location"))?.trim() || null;
	const description = safe(() => textValue(ev, "description")) ?? "";
	const conference = safe(() => textValue(ev, "x-google-conference"))?.trim();
	const urlProp = safe(() => textValue(ev, "url"))?.trim();
	const found =
		location?.match(MEETING_LINK_RE)?.[0] ||
		description.match(MEETING_LINK_RE)?.[0];
	const url = conference || (found ? trimLink(found) : null) || urlProp || null;
	return { title, location, url };
}

function trimLink(link: string): string {
	return link.replace(/[.,;:!?]+$/, "");
}

// ---------------------------------------------------------------------------
// Durations

type Dur = { kind: "days"; days: number } | { kind: "ms"; ms: number };

function durationOf(
	ev: IcalComponent,
	dtstart: IcalTime,
	tzid: string | null,
): Dur {
	const dtendProp = ev.getFirstProperty("dtend");
	if (dtendProp) {
		const end = dtendProp.getFirstValue() as IcalTime;
		if (dtstart.isDate) {
			const days = Math.round(dayNumber(end) - dayNumber(dtstart));
			return { kind: "days", days: Math.max(0, days) };
		}
		const s = timeToMs(dtstart, tzid);
		const e = propToMs(dtendProp);
		if (s !== null && e !== null) return { kind: "ms", ms: Math.max(0, e - s) };
	}
	const durProp = ev.getFirstProperty("duration");
	if (durProp) {
		const d = durProp.getFirstValue() as InstanceType<typeof ICAL.Duration>;
		const seconds = d.toSeconds();
		if (dtstart.isDate) {
			return { kind: "days", days: Math.max(0, Math.round(seconds / 86400)) };
		}
		return { kind: "ms", ms: Math.max(0, seconds * 1000) };
	}
	return dtstart.isDate
		? { kind: "days", days: 1 }
		: { kind: "ms", ms: DEFAULT_TIMED_DURATION_MS };
}

function addDuration(start: IcalTime, startMs: number, dur: Dur): number {
	if (dur.kind === "ms") return startMs + dur.ms;
	if (start.isDate) {
		return new Date(
			start.year,
			start.month - 1,
			start.day + dur.days,
		).getTime();
	}
	return startMs + dur.days * 86_400_000;
}

/** Days since epoch for a calendar date (zone-free). */
function dayNumber(t: IcalTime): number {
	return Date.UTC(t.year, t.month - 1, t.day) / 86_400_000;
}

// ---------------------------------------------------------------------------
// Time conversion

function tzidOf(prop: IcalProperty): string | null {
	const tz = prop.getParameter("tzid");
	return typeof tz === "string" && tz ? tz : null;
}

function propToMs(prop: IcalProperty): number | null {
	const v = prop.getFirstValue();
	if (!(v instanceof ICAL.Time)) return null;
	return timeToMs(v, tzidOf(prop));
}

/**
 * Convert an ical.js Time to epoch ms.
 * `tzid` is the TZID parameter of the originating property, used when
 * ical.js couldn't resolve it from a VTIMEZONE (time is then "floating").
 */
function timeToMs(t: IcalTime, tzid: string | null): number | null {
	if (!t || Number.isNaN(t.year)) return null;
	if (t.isDate) return new Date(t.year, t.month - 1, t.day).getTime();
	const zone = t.zone;
	if (zone === ICAL.Timezone.utcTimezone || zone?.tzid === "UTC") {
		return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
	}
	if (
		!zone ||
		zone === ICAL.Timezone.localTimezone ||
		zone.tzid === "floating"
	) {
		const iana = tzid ? resolveIana(tzid) : null;
		if (iana) {
			return zonedWallToUtc(
				iana,
				t.year,
				t.month,
				t.day,
				t.hour,
				t.minute,
				t.second,
			);
		}
		return new Date(
			t.year,
			t.month - 1,
			t.day,
			t.hour,
			t.minute,
			t.second,
		).getTime();
	}
	const ms = t.toUnixTime() * 1000;
	return Number.isFinite(ms) ? ms : null;
}

const ianaCache = new Map<string, string | null>();
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function resolveIana(tzid: string): string | null {
	if (ianaCache.has(tzid)) return ianaCache.get(tzid) ?? null;
	const candidates = [tzid.replace(/^"|"$/g, "")];
	const tail = tzid.match(/([A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/)?.[1];
	if (tail) {
		const parts = tail.split("/");
		candidates.push(tail, parts.slice(-2).join("/"));
	}
	let found: string | null = null;
	for (const c of candidates) {
		try {
			fmtFor(c);
			found = c;
			break;
		} catch {
			// not a zone Intl knows
		}
	}
	ianaCache.set(tzid, found);
	return found;
}

function fmtFor(zone: string): Intl.DateTimeFormat {
	let f = fmtCache.get(zone);
	if (!f) {
		f = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		fmtCache.set(zone, f);
	}
	return f;
}

/** Offset (ms) of `zone` from UTC at instant `ms`. */
function zoneOffset(zone: string, ms: number): number {
	const parts: Record<string, number> = {};
	for (const p of fmtFor(zone).formatToParts(new Date(ms))) {
		if (p.type !== "literal") parts[p.type] = Number(p.value);
	}
	const asUtc = Date.UTC(
		parts.year ?? 1970,
		(parts.month ?? 1) - 1,
		parts.day ?? 1,
		(parts.hour ?? 0) % 24,
		parts.minute ?? 0,
		parts.second ?? 0,
	);
	return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in an IANA zone → epoch ms. */
function zonedWallToUtc(
	zone: string,
	y: number,
	mo: number,
	d: number,
	h: number,
	mi: number,
	s: number,
): number {
	const guess = Date.UTC(y, mo - 1, d, h, mi, s);
	const off1 = zoneOffset(zone, guess);
	let ms = guess - off1;
	const off2 = zoneOffset(zone, ms);
	if (off2 !== off1) ms = guess - off2;
	return ms;
}

// ---------------------------------------------------------------------------

function textValue(comp: IcalComponent, name: string): string | null {
	const v = comp.getFirstPropertyValue(name);
	if (v === null || v === undefined) return null;
	return String(v);
}

function safe<T>(fn: () => T): T | null {
	try {
		return fn();
	} catch {
		return null;
	}
}
