import { calendars, db, timeBlocks } from "@deep/db";
import { type CalendarFeed, localDate, minToHhmm } from "@deep/shared";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { changed } from "../lib/bus";
import {
	clearCalendarBlocks,
	fetchFeed,
	syncAll,
	syncCalendar,
} from "../lib/calendar";
import { parseCalendar } from "../lib/ics";

function toFeed(r: typeof calendars.$inferSelect): CalendarFeed {
	// The address is a secret: show only enough to recognise it.
	const masked = r.url.replace(/(private-)[0-9a-f]+/i, "$1…");
	return {
		id: r.id,
		name: r.name,
		url: masked.length > 90 ? `${masked.slice(0, 87)}…` : masked,
		enabled: r.enabled,
		lastSyncAt: r.lastSyncAt,
		lastError: r.lastError,
		eventCount: r.eventCount,
	};
}

async function getCal(id: number) {
	const cal = await db.query.calendars.findFirst({
		where: eq(calendars.id, id),
	});
	if (!cal) throw new HTTPException(404, { message: "Calendar not found." });
	return cal;
}

export const calendarsRouter = new Hono()
	.get("/", async (c) => {
		const rows = await db.query.calendars.findMany({
			orderBy: asc(calendars.id),
		});
		return c.json(rows.map(toFeed));
	})
	.post(
		"/",
		zValidator(
			"json",
			z.object({
				url: z
					.string()
					.trim()
					.regex(
						/^(https?|webcal):\/\//i,
						"Paste a calendar address (https://…).",
					)
					.max(2000),
			}),
		),
		async (c) => {
			const { url } = c.req.valid("json");
			// Check it before saving, so a wrong address fails right away.
			let name: string | null;
			try {
				const text = await fetchFeed(url);
				name = parseCalendar(text, {
					from: new Date(),
					to: new Date(),
				}).name;
			} catch (err) {
				throw new HTTPException(400, {
					message: err instanceof Error ? err.message : String(err),
				});
			}
			const [row] = await db
				.insert(calendars)
				.values({ url, name: name || "Calendar" })
				.returning();
			await syncCalendar(row!);
			changed("calendar", "day");
			return c.json(toFeed(await getCal(row!.id)), 201);
		},
	)
	.patch(
		"/:id",
		zValidator(
			"json",
			z
				.object({
					enabled: z.boolean(),
					name: z.string().trim().min(1).max(100),
				})
				.partial(),
		),
		async (c) => {
			const id = Number(c.req.param("id"));
			await getCal(id);
			const patch = c.req.valid("json");
			await db.update(calendars).set(patch).where(eq(calendars.id, id));
			const cal = await getCal(id);
			if (patch.enabled === false) await clearCalendarBlocks(id);
			if (patch.enabled === true) await syncCalendar(cal);
			changed("calendar", "day");
			return c.json(toFeed(await getCal(id)));
		},
	)
	.delete("/:id", async (c) => {
		const id = Number(c.req.param("id"));
		await getCal(id);
		await clearCalendarBlocks(id);
		await db.delete(calendars).where(eq(calendars.id, id));
		changed("calendar", "day");
		return c.json({ ok: true });
	})
	.post("/sync", async (c) => {
		await syncAll();
		const rows = await db.query.calendars.findMany({
			orderBy: asc(calendars.id),
		});
		return c.json(rows.map(toFeed));
	})
	/** The next meeting today that hasn't started yet (calendar or added by hand). */
	.get("/next", async (c) => {
		const now = new Date();
		const nowMin = now.getHours() * 60 + now.getMinutes();
		const next = await db.query.timeBlocks.findFirst({
			where: and(
				eq(timeBlocks.date, localDate(now)),
				eq(timeBlocks.kind, "meeting"),
				gt(timeBlocks.startMin, nowMin),
			),
			orderBy: asc(timeBlocks.startMin),
		});
		return c.json(
			next
				? {
						title: next.title,
						startMin: next.startMin,
						durationMin: next.durationMin,
						at: minToHhmm(next.startMin),
						inMin: next.startMin - nowMin,
						url: next.url,
					}
				: null,
		);
	});
