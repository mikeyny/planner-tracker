import { db, projects, reviews } from "@deep/db";
import {
	addDays,
	formatMinutes,
	localDate,
	mondayOf,
	type WeeklyReview,
	type WeeklyReviewData,
} from "@deep/shared";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { AiError, geminiAvailable, summarizeWeek } from "../lib/ai";
import { changed } from "../lib/bus";
import { heatmapFor, weekStatsFor } from "../lib/insights";
import { multipliers } from "../lib/stats";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function load(start: string) {
	return db.query.reviews.findFirst({
		where: and(eq(reviews.kind, "weekly"), eq(reviews.periodStart, start)),
	});
}

function toReview(
	start: string,
	row?: typeof reviews.$inferSelect,
): WeeklyReview {
	return {
		periodStart: start,
		data: (row?.data as WeeklyReviewData) ?? {},
		aiSummary: row?.aiSummary ?? null,
		completedAt: row?.completedAt ?? null,
	};
}

async function save(
	start: string,
	patch: Partial<typeof reviews.$inferInsert>,
) {
	await db
		.insert(reviews)
		.values({ kind: "weekly", periodStart: start, ...patch })
		.onConflictDoUpdate({
			target: [reviews.kind, reviews.periodStart],
			set: patch,
		});
}

/** Plain-text facts about a week, for the AI summary. */
async function weekFacts(start: string, data: WeeklyReviewData) {
	const [w, mult, heat] = await Promise.all([
		weekStatsFor(start),
		multipliers(),
		heatmapFor(4),
	]);
	const deep = w.energy.deep;
	const total = Math.max(1, w.focusSec);
	return [
		`Week of ${w.start} to ${w.end}.`,
		`Focused ${formatMinutes(w.focusSec / 60)} against a ${formatMinutes(w.targetSec / 60)} weekday target, over ${w.sessions} sessions. Days on target: ${w.daysOnTarget}.`,
		`By project: ${w.perProject.map((p) => `${p.name} ${formatMinutes(p.sec / 60)}${p.targetMin ? ` of ${formatMinutes(p.targetMin)} target` : ""}`).join("; ") || "none"}.`,
		`Deep work share: ${Math.round((deep / total) * 100)}%. Average project switches per day: ${w.switchesPerDay}. Longest session: ${formatMinutes(w.longestSessionSec / 60)}.`,
		`Tasks finished: ${w.tasksDone}. Urges logged: ${w.urges}. Interruptions: ${w.interruptions}.`,
		w.topDistractions.length
			? `Most common distractions: ${w.topDistractions.map((d) => `${d.text} (${d.count})`).join(", ")}.`
			: "",
		heat.bestHours.length
			? `Best focus hours over the last 4 weeks: ${heat.bestHours.map((h) => `${h}:00`).join(", ")}.`
			: "",
		mult.overall.value
			? `Tasks take ${mult.overall.value}x their estimates on average.`
			: "",
		data.wentWell ? `They said went well: ${data.wentWell}` : "",
		data.change ? `They want to change: ${data.change}` : "",
		data.focusNext ? `Their focus for next week: ${data.focusNext}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

const reviewData = z.object({
	wentWell: z.string().max(2000).optional(),
	change: z.string().max(2000).optional(),
	focusNext: z.string().max(500).optional(),
	budgets: z
		.record(
			z.string(),
			z
				.number()
				.int()
				.min(0)
				.max(100 * 60),
		)
		.optional(),
});

export const reviewsRouter = new Hono()
	/** The week that should be reviewed now (last week) and whether it's done. */
	.get("/weekly/pending", async (c) => {
		const start = addDays(mondayOf(localDate()), -7);
		const row = await load(start);
		// A week with no tracked focus has nothing to review; don't nag about it.
		const empty = !row && (await weekStatsFor(start)).sessions === 0;
		return c.json({ start, done: !!row?.completedAt || empty, empty });
	})
	.get("/weekly/:start", async (c) => {
		const start = mondayOf(dateStr.parse(c.req.param("start")));
		return c.json(toReview(start, await load(start)));
	})
	.put(
		"/weekly/:start",
		zValidator("json", z.object({ data: reviewData })),
		async (c) => {
			const start = mondayOf(dateStr.parse(c.req.param("start")));
			const prev = (await load(start))?.data as WeeklyReviewData | undefined;
			await save(start, { data: { ...prev, ...c.req.valid("json").data } });
			return c.json(toReview(start, await load(start)));
		},
	)
	.post("/weekly/:start/summary", async (c) => {
		const start = mondayOf(dateStr.parse(c.req.param("start")));
		const data = ((await load(start))?.data as WeeklyReviewData) ?? {};
		const facts = await weekFacts(start, data);
		let summary: string | null = null;
		let nextFocus: string | null = null;
		let ai = false;
		let warning: string | null = null;
		if (geminiAvailable()) {
			try {
				const res = await summarizeWeek(facts);
				summary = res.summary;
				nextFocus = res.nextFocus;
				ai = true;
			} catch (err) {
				// Still give a summary from the numbers; say why it isn't the AI one.
				warning = err instanceof AiError ? err.message : "AI request failed.";
			}
		}
		if (!summary) {
			const w = await weekStatsFor(start);
			const top = w.perProject[0];
			summary = `You focused for ${formatMinutes(w.focusSec / 60)} across ${w.sessions} sessions and finished ${w.tasksDone} tasks.${top ? ` Most of it went to ${top.name}.` : ""} You hit your daily target on ${w.daysOnTarget} day${w.daysOnTarget === 1 ? "" : "s"}.`;
		}
		await save(start, { aiSummary: summary });
		return c.json({ summary, nextFocus, ai, warning });
	})
	/** Finish the review: apply next week's project budgets. */
	.post("/weekly/:start/complete", async (c) => {
		const start = mondayOf(dateStr.parse(c.req.param("start")));
		const data = ((await load(start))?.data as WeeklyReviewData) ?? {};
		for (const [id, minutes] of Object.entries(data.budgets ?? {})) {
			await db
				.update(projects)
				.set({ weeklyTargetMin: minutes > 0 ? minutes : null })
				.where(eq(projects.id, Number(id)));
		}
		await save(start, { completedAt: new Date().toISOString() });
		changed("projects");
		return c.json(toReview(start, await load(start)));
	});
