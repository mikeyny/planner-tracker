import { describe, expect, test } from "bun:test";
import { type CalendarOccurrence, parseCalendar } from "../src/lib/ics";

// ---------------------------------------------------------------------------
// Google-style fixture helpers

const VTZ_JOBURG = `BEGIN:VTIMEZONE
TZID:Africa/Johannesburg
X-LIC-LOCATION:Africa/Johannesburg
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0200
TZNAME:SAST
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE`;

const VTZ_NEW_YORK = `BEGIN:VTIMEZONE
TZID:America/New_York
X-LIC-LOCATION:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

/** Wrap VEVENT blocks in a Google-like VCALENDAR (CRLF line endings). */
function cal(events: string[], opts: { name?: string } = {}): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"PRODID:-//Google Inc//Google Calendar 70.9054//EN",
		"VERSION:2.0",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		...(opts.name ? [`X-WR-CALNAME:${opts.name}`] : []),
		"X-WR-TIMEZONE:Africa/Johannesburg",
		VTZ_JOBURG,
		VTZ_NEW_YORK,
		...events,
		"END:VCALENDAR",
	];
	return `${lines.join("\n").replace(/\r?\n/g, "\r\n")}\r\n`;
}

function vevent(props: string[]): string {
	return [
		"BEGIN:VEVENT",
		"DTSTAMP:20261001T000000Z",
		"CREATED:20261001T000000Z",
		"SEQUENCE:0",
		...props,
		"END:VEVENT",
	].join("\n");
}

const range = (from: string, to: string) => ({
	from: new Date(from),
	to: new Date(to),
});

const starts = (occ: CalendarOccurrence[]) => occ.map((o) => o.start);
const byTitle = (occ: CalendarOccurrence[], title: string) =>
	occ.filter((o) => o.title === title);

const OCT = range("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z");

// ---------------------------------------------------------------------------

describe("parseCalendar: basics", () => {
	test("calendar name from X-WR-CALNAME", () => {
		expect(parseCalendar(cal([], { name: "Work" }), OCT).name).toBe("Work");
		expect(parseCalendar(cal([]), OCT).name).toBeNull();
	});

	test("single timed event in a VTIMEZONE zone converts to UTC", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:single-1@google.com",
					"DTSTART;TZID=Africa/Johannesburg:20261013T090000",
					"DTEND;TZID=Africa/Johannesburg:20261013T100000",
					"SUMMARY:Standup",
					"LOCATION:Office\\, Room 2",
					"STATUS:CONFIRMED",
					"TRANSP:OPAQUE",
				]),
			]),
			OCT,
		);
		expect(occurrences).toEqual([
			{
				uid: "single-1@google.com",
				title: "Standup",
				start: "2026-10-13T07:00:00.000Z",
				end: "2026-10-13T08:00:00.000Z",
				allDay: false,
				location: "Office, Room 2",
				url: null,
			},
		]);
	});

	test("UTC event", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:utc-1",
					"DTSTART:20261013T120000Z",
					"DTEND:20261013T123000Z",
					"SUMMARY:Call",
				]),
			]),
			OCT,
		);
		expect(occurrences).toHaveLength(1);
		expect(occurrences[0]?.start).toBe("2026-10-13T12:00:00.000Z");
		expect(occurrences[0]?.end).toBe("2026-10-13T12:30:00.000Z");
	});

	test("missing SUMMARY falls back to Busy; missing end defaults to 30 min", () => {
		const { occurrences } = parseCalendar(
			cal([vevent(["UID:busy", "DTSTART:20261013T120000Z"])]),
			OCT,
		);
		expect(occurrences[0]?.title).toBe("Busy");
		expect(occurrences[0]?.end).toBe("2026-10-13T12:30:00.000Z");
	});

	test("all-day event spans local midnights", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:allday-1",
					"DTSTART;VALUE=DATE:20261014",
					"DTEND;VALUE=DATE:20261016",
					"SUMMARY:Conference",
				]),
			]),
			OCT,
		);
		expect(occurrences).toHaveLength(1);
		expect(occurrences[0]?.allDay).toBe(true);
		expect(occurrences[0]?.start).toBe(new Date(2026, 9, 14).toISOString());
		expect(occurrences[0]?.end).toBe(new Date(2026, 9, 16).toISOString());
	});

	test("all-day event without DTEND lasts one day", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:allday-2",
					"DTSTART;VALUE=DATE:20261020",
					"SUMMARY:Holiday",
				]),
			]),
			OCT,
		);
		expect(occurrences[0]?.end).toBe(new Date(2026, 9, 21).toISOString());
	});

	test("floating time is treated as local machine time", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:float-1",
					"DTSTART:20261013T090000",
					"DTEND:20261013T093000",
					"SUMMARY:Floating",
				]),
			]),
			OCT,
		);
		expect(occurrences[0]?.start).toBe(
			new Date(2026, 9, 13, 9, 0).toISOString(),
		);
		expect(occurrences[0]?.end).toBe(
			new Date(2026, 9, 13, 9, 30).toISOString(),
		);
	});

	test("TZID without a VTIMEZONE falls back to the IANA zone", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:london-1",
					"DTSTART;TZID=Europe/London:20261013T090000",
					"DTEND;TZID=Europe/London:20261013T100000",
					"SUMMARY:London (BST)",
				]),
				vevent([
					"UID:london-2",
					"DTSTART;TZID=Europe/London:20261029T090000",
					"DTEND;TZID=Europe/London:20261029T100000",
					"SUMMARY:London (GMT)",
				]),
			]),
			range("2026-10-01T00:00:00Z", "2026-11-30T00:00:00Z"),
		);
		expect(starts(occurrences)).toEqual([
			"2026-10-13T08:00:00.000Z",
			"2026-10-29T09:00:00.000Z",
		]);
	});

	test("DURATION instead of DTEND", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:dur-1",
					"DTSTART;TZID=Africa/Johannesburg:20261013T140000",
					"DURATION:PT45M",
					"SUMMARY:Review",
				]),
			]),
			OCT,
		);
		expect(occurrences[0]?.start).toBe("2026-10-13T12:00:00.000Z");
		expect(occurrences[0]?.end).toBe("2026-10-13T12:45:00.000Z");
	});

	test("occurrences are sorted by start", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent(["UID:b", "DTSTART:20261015T120000Z", "SUMMARY:B"]),
				vevent(["UID:a", "DTSTART:20261013T120000Z", "SUMMARY:A"]),
				vevent(["UID:c", "DTSTART:20261014T120000Z", "SUMMARY:C"]),
			]),
			OCT,
		);
		expect(occurrences.map((o) => o.title)).toEqual(["A", "C", "B"]);
	});
});

describe("parseCalendar: range clipping", () => {
	const ics = cal([
		vevent([
			"UID:overlap-start",
			"DTSTART:20261012T230000Z",
			"DTEND:20261013T010000Z",
			"SUMMARY:Overlaps start",
		]),
		vevent([
			"UID:ends-at-start",
			"DTSTART:20261012T220000Z",
			"DTEND:20261013T000000Z",
			"SUMMARY:Ends at range start",
		]),
		vevent([
			"UID:inside",
			"DTSTART:20261013T100000Z",
			"DTEND:20261013T110000Z",
			"SUMMARY:Inside",
		]),
		vevent([
			"UID:starts-at-end",
			"DTSTART:20261014T000000Z",
			"DTEND:20261014T010000Z",
			"SUMMARY:Starts at range end",
		]),
	]);

	test("includes events overlapping [from, to), excludes touching ones", () => {
		const { occurrences } = parseCalendar(
			ics,
			range("2026-10-13T00:00:00Z", "2026-10-14T00:00:00Z"),
		);
		expect(occurrences.map((o) => o.title)).toEqual([
			"Overlaps start",
			"Inside",
		]);
	});
});

describe("parseCalendar: recurring events", () => {
	// Mon/Wed/Fri 10:00 New York, crossing the 2026-11-01 DST change.
	const weekly = cal([
		vevent([
			"UID:weekly-1@google.com",
			"DTSTART;TZID=America/New_York:20261019T100000",
			"DTEND;TZID=America/New_York:20261019T103000",
			"RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=MO,WE,FR",
			"EXDATE;TZID=America/New_York:20261021T100000",
			"SUMMARY:Team sync",
			"X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
		]),
		// Fri Oct 23 moved from 10:00 to 13:00.
		vevent([
			"UID:weekly-1@google.com",
			"RECURRENCE-ID;TZID=America/New_York:20261023T100000",
			"DTSTART;TZID=America/New_York:20261023T130000",
			"DTEND;TZID=America/New_York:20261023T133000",
			"SUMMARY:Team sync (moved)",
		]),
		// Wed Oct 28 cancelled.
		vevent([
			"UID:weekly-1@google.com",
			"RECURRENCE-ID;TZID=America/New_York:20261028T100000",
			"DTSTART;TZID=America/New_York:20261028T100000",
			"DTEND;TZID=America/New_York:20261028T103000",
			"STATUS:CANCELLED",
			"SUMMARY:Team sync",
		]),
		// Mon Nov 9 (outside range) pulled forward into range: Thu Nov 5 09:00.
		vevent([
			"UID:weekly-1@google.com",
			"RECURRENCE-ID;TZID=America/New_York:20261109T100000",
			"DTSTART;TZID=America/New_York:20261105T090000",
			"DTEND;TZID=America/New_York:20261105T093000",
			"SUMMARY:Team sync (pulled in)",
		]),
	]);
	const R = range("2026-10-19T00:00:00Z", "2026-11-07T00:00:00Z");

	test("BYDAY expansion with EXDATE, moved and cancelled instances, DST", () => {
		const { occurrences } = parseCalendar(weekly, R);
		expect(starts(occurrences)).toEqual([
			"2026-10-19T14:00:00.000Z", // Mon 10:00 EDT
			// Wed 21 EXDATE'd
			"2026-10-23T17:00:00.000Z", // Fri moved to 13:00 EDT
			"2026-10-26T14:00:00.000Z",
			// Wed 28 cancelled
			"2026-10-30T14:00:00.000Z",
			"2026-11-02T15:00:00.000Z", // Mon 10:00 EST after DST ends
			"2026-11-04T15:00:00.000Z",
			"2026-11-05T14:00:00.000Z", // Nov 9 instance moved to Thu 09:00 EST
			"2026-11-06T15:00:00.000Z",
		]);
		const first = occurrences[0];
		expect(first?.end).toBe("2026-10-19T14:30:00.000Z");
		expect(first?.title).toBe("Team sync");
		expect(first?.url).toBe("https://meet.google.com/abc-defg-hij");
		expect(first?.uid).toBe("weekly-1@google.com@2026-10-19T14:00:00.000Z");
		expect(occurrences[1]?.title).toBe("Team sync (moved)");
		expect(occurrences[1]?.end).toBe("2026-10-23T17:30:00.000Z");
		expect(new Set(occurrences.map((o) => o.uid)).size).toBe(
			occurrences.length,
		);
	});

	test("COUNT limits the series", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:count-1",
					"DTSTART;TZID=Africa/Johannesburg:20261013T080000",
					"DTEND;TZID=Africa/Johannesburg:20261013T081500",
					"RRULE:FREQ=DAILY;COUNT=3",
					"SUMMARY:Three days",
				]),
			]),
			OCT,
		);
		expect(starts(occurrences)).toEqual([
			"2026-10-13T06:00:00.000Z",
			"2026-10-14T06:00:00.000Z",
			"2026-10-15T06:00:00.000Z",
		]);
	});

	test("UNTIL limits the series; INTERVAL is honoured", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:until-1",
					"DTSTART;TZID=Africa/Johannesburg:20261006T150000",
					"DTEND;TZID=Africa/Johannesburg:20261006T160000",
					"RRULE:FREQ=WEEKLY;UNTIL=20261027T235959Z;BYDAY=TU",
					"SUMMARY:Weekly until",
				]),
				vevent([
					"UID:interval-1",
					"DTSTART:20261001T090000Z",
					"DTEND:20261001T100000Z",
					"RRULE:FREQ=WEEKLY;INTERVAL=2",
					"SUMMARY:Fortnightly",
				]),
			]),
			OCT,
		);
		expect(starts(byTitle(occurrences, "Weekly until"))).toEqual([
			"2026-10-06T13:00:00.000Z",
			"2026-10-13T13:00:00.000Z",
			"2026-10-20T13:00:00.000Z",
			"2026-10-27T13:00:00.000Z",
		]);
		expect(starts(byTitle(occurrences, "Fortnightly"))).toEqual([
			"2026-10-01T09:00:00.000Z",
			"2026-10-15T09:00:00.000Z",
			"2026-10-29T09:00:00.000Z",
		]);
	});

	test("monthly BYDAY rule", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:monthly-1",
					"DTSTART;TZID=Africa/Johannesburg:20260106T110000",
					"DTEND;TZID=Africa/Johannesburg:20260106T120000",
					"RRULE:FREQ=MONTHLY;BYDAY=1TU",
					"SUMMARY:Monthly review",
				]),
			]),
			range("2026-09-01T00:00:00Z", "2026-12-01T00:00:00Z"),
		);
		expect(starts(occurrences)).toEqual([
			"2026-09-01T09:00:00.000Z",
			"2026-10-06T09:00:00.000Z",
			"2026-11-03T09:00:00.000Z",
		]);
	});

	test("recurring all-day event with EXDATE", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:allday-rec",
					"DTSTART;VALUE=DATE:20261012",
					"DTEND;VALUE=DATE:20261013",
					"RRULE:FREQ=DAILY;COUNT=4",
					"EXDATE;VALUE=DATE:20261013",
					"SUMMARY:OOO",
				]),
			]),
			OCT,
		);
		expect(starts(occurrences)).toEqual([
			new Date(2026, 9, 12).toISOString(),
			new Date(2026, 9, 14).toISOString(),
			new Date(2026, 9, 15).toISOString(),
		]);
		expect(occurrences.every((o) => o.allDay)).toBe(true);
		expect(occurrences[0]?.end).toBe(new Date(2026, 9, 13).toISOString());
	});

	test("long-running infinite series started years ago still reaches the range", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:daily-forever",
					"DTSTART;TZID=Africa/Johannesburg:20200101T070000",
					"DTEND;TZID=Africa/Johannesburg:20200101T071500",
					"RRULE:FREQ=DAILY",
					"SUMMARY:Daily",
				]),
			]),
			range("2026-10-12T00:00:00Z", "2026-10-19T00:00:00Z"),
		);
		expect(occurrences).toHaveLength(7);
		expect(occurrences[0]?.start).toBe("2026-10-12T05:00:00.000Z");
	});

	test("expansion is capped per series", () => {
		const t0 = performance.now();
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:hourly",
					"DTSTART:20261001T000000Z",
					"DTEND:20261001T000500Z",
					"RRULE:FREQ=HOURLY",
					"SUMMARY:Ping",
				]),
			]),
			range("2026-10-01T00:00:00Z", "2027-10-01T00:00:00Z"),
		);
		expect(occurrences).toHaveLength(1000);
		expect(performance.now() - t0).toBeLessThan(5000);
	});

	test("RECURRENCE-ID override without a master is still shown", () => {
		const { occurrences } = parseCalendar(
			cal([
				vevent([
					"UID:orphan",
					"RECURRENCE-ID:20261014T090000Z",
					"DTSTART:20261014T100000Z",
					"DTEND:20261014T110000Z",
					"SUMMARY:One instance I was invited to",
				]),
			]),
			OCT,
		);
		expect(occurrences).toHaveLength(1);
		expect(occurrences[0]?.uid).toBe("orphan@2026-10-14T10:00:00.000Z");
	});
});

describe("parseCalendar: filtering", () => {
	const attendees = [
		"ORGANIZER;CN=Boss:mailto:boss@example.com",
		"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=boss@example.com;X-NUM-GUESTS=0:mailto:boss@example.com",
	];
	const ics = cal([
		vevent([
			"UID:declined-1",
			"DTSTART:20261013T090000Z",
			"DTEND:20261013T100000Z",
			"SUMMARY:Declined meeting",
			...attendees,
			"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=DECLINED;CN=Me;X-NUM-GUESTS=0:mailto:Me@Example.com",
		]),
		vevent([
			"UID:accepted-1",
			"DTSTART:20261013T110000Z",
			"DTEND:20261013T120000Z",
			"SUMMARY:Accepted meeting",
			...attendees,
			"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Me;X-NUM-GUESTS=0:mailto:me@example.com",
		]),
		vevent([
			"UID:free-1",
			"DTSTART:20261013T130000Z",
			"DTEND:20261013T140000Z",
			"SUMMARY:Focus (free)",
			"TRANSP:TRANSPARENT",
		]),
		vevent([
			"UID:cancelled-1",
			"DTSTART:20261013T150000Z",
			"DTEND:20261013T160000Z",
			"SUMMARY:Cancelled",
			"STATUS:CANCELLED",
		]),
		// Recurring daily, I declined just the Wednesday instance.
		vevent([
			"UID:rec-declined",
			"DTSTART:20261012T070000Z",
			"DTEND:20261012T073000Z",
			"RRULE:FREQ=DAILY;COUNT=3",
			"SUMMARY:Daily",
			"ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com",
		]),
		vevent([
			"UID:rec-declined",
			"RECURRENCE-ID:20261014T070000Z",
			"DTSTART:20261014T070000Z",
			"DTEND:20261014T073000Z",
			"SUMMARY:Daily",
			"ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com",
		]),
	]);

	test("declined events are skipped only when selfEmail matches", () => {
		const mine = parseCalendar(ics, { ...OCT, selfEmail: "ME@example.com" });
		expect(mine.occurrences.map((o) => o.title)).toEqual([
			"Daily",
			"Daily",
			"Accepted meeting",
		]);
		expect(starts(byTitle(mine.occurrences, "Daily"))).toEqual([
			"2026-10-12T07:00:00.000Z",
			"2026-10-13T07:00:00.000Z",
		]);

		const anyone = parseCalendar(ics, OCT);
		expect(anyone.occurrences.map((o) => o.title)).toContain(
			"Declined meeting",
		);
		expect(byTitle(anyone.occurrences, "Daily")).toHaveLength(3);
	});

	test("transparent and cancelled events are skipped", () => {
		const titles = parseCalendar(ics, OCT).occurrences.map((o) => o.title);
		expect(titles).not.toContain("Focus (free)");
		expect(titles).not.toContain("Cancelled");
	});
});

describe("parseCalendar: meeting links", () => {
	const ics = cal([
		vevent([
			"UID:meet",
			"DTSTART:20261013T090000Z",
			"SUMMARY:Meet",
			"DESCRIPTION:Join with Google Meet: https://meet.google.com/xyz-abcd-efg\\n\\nJoin by phone",
		]),
		vevent([
			"UID:zoom",
			"DTSTART:20261013T100000Z",
			"SUMMARY:Zoom",
			'DESCRIPTION:Agenda\\nJoin: <a href="https://us02web.zoom.us/j/123456789?pwd=abc">here</a>.',
		]),
		vevent([
			"UID:teams",
			"DTSTART:20261013T110000Z",
			"SUMMARY:Teams",
			"LOCATION:https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0",
		]),
		vevent([
			"UID:url",
			"DTSTART:20261013T120000Z",
			"SUMMARY:URL prop",
			"URL:https://example.com/event/1",
		]),
		vevent([
			"UID:conf-wins",
			"DTSTART:20261013T130000Z",
			"SUMMARY:Conference wins",
			"X-GOOGLE-CONFERENCE:https://meet.google.com/aaa-bbbb-ccc",
			"DESCRIPTION:Old link https://zoom.us/j/999",
		]),
		vevent(["UID:none", "DTSTART:20261013T140000Z", "SUMMARY:No link"]),
	]);

	test("extracts the meeting URL in priority order", () => {
		const urls = Object.fromEntries(
			parseCalendar(ics, OCT).occurrences.map((o) => [o.title, o.url]),
		);
		expect(urls).toEqual({
			Meet: "https://meet.google.com/xyz-abcd-efg",
			Zoom: "https://us02web.zoom.us/j/123456789?pwd=abc",
			Teams:
				"https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0",
			"URL prop": "https://example.com/event/1",
			"Conference wins": "https://meet.google.com/aaa-bbbb-ccc",
			"No link": null,
		});
	});
});

describe("parseCalendar: robustness", () => {
	test("malformed events are skipped, the rest survive", () => {
		const ics = cal([
			vevent([
				"UID:bad-date",
				"DTSTART:notadate",
				"DTEND:20261013T100000Z",
				"SUMMARY:Bad date",
			]),
			vevent(["UID:no-start", "SUMMARY:No start"]),
			vevent([
				"UID:bad-rrule",
				"DTSTART:20261013T080000Z",
				"RRULE:FREQ=SOMETIMES;BYDAY=XX",
				"SUMMARY:Bad rule",
			]),
			"BEGIN:VEVENT\nUID:garbage-line\nthis line has no colon\nDTSTART:20261013T110000Z\nSUMMARY:Garbage line\nEND:VEVENT",
			vevent([
				"UID:good",
				"DTSTART:20261013T090000Z",
				"DTEND:20261013T100000Z",
				"SUMMARY:Good",
			]),
		]);
		const { occurrences } = parseCalendar(ics, OCT);
		const titles = occurrences.map((o) => o.title);
		expect(titles).toContain("Good");
		expect(titles).not.toContain("No start");
		expect(titles).not.toContain("Bad date");
	});

	test("non-calendar text throws a clear error", () => {
		expect(() => parseCalendar("<html>Not found</html>", OCT)).toThrow(
			/iCalendar/,
		);
		expect(() => parseCalendar("", OCT)).toThrow(/iCalendar/);
		expect(() =>
			parseCalendar("BEGIN:VCARD\r\nFN:Bob\r\nEND:VCARD\r\n", OCT),
		).toThrow(/iCalendar/);
	});

	test("an empty calendar yields no occurrences", () => {
		expect(parseCalendar(cal([]), OCT).occurrences).toEqual([]);
	});
});
