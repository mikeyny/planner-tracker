import { dayPlans, db, timeBlocks } from "@deep/db";
import { type DayPlan, formatMinutes, type TimeBlock } from "@deep/shared";
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { geminiAvailable, summarizeDay } from "../lib/ai";
import { changed } from "../lib/bus";
import { capacity, dayStats, multipliers, sessionsForDay } from "../lib/stats";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function toPlan(date: string, row?: typeof dayPlans.$inferSelect): DayPlan {
	return {
		date,
		intention: row?.intention ?? null,
		startedAt: row?.startedAt ?? null,
		shutdownAt: row?.shutdownAt ?? null,
		energyRating: row?.energyRating ?? null,
		wentWell: row?.wentWell ?? null,
		gotInWay: row?.gotInWay ?? null,
		aiSummary: row?.aiSummary ?? null,
	};
}

async function upsertPlan(
	date: string,
	patch: Partial<typeof dayPlans.$inferInsert>,
) {
	await db
		.insert(dayPlans)
		.values({ date, ...patch })
		.onConflictDoUpdate({ target: dayPlans.date, set: patch });
}

export const dayRouter = new Hono()
	.get("/:date", async (c) => {
		const date = dateStr.parse(c.req.param("date"));
		const [plan, blocks, sessions] = await Promise.all([
			db.query.dayPlans.findFirst({ where: eq(dayPlans.date, date) }),
			db.query.timeBlocks.findMany({
				where: eq(timeBlocks.date, date),
				orderBy: asc(timeBlocks.startMin),
			}),
			sessionsForDay(date),
		]);
		return c.json({
			plan: toPlan(date, plan),
			blocks: blocks as TimeBlock[],
			sessions: sessions.map((s) => ({
				id: s.id,
				kind: s.kind,
				projectId: s.projectId,
				taskId: s.taskId,
				startedAt: s.startedAt,
				endedAt: s.endedAt,
				activeSec: s.activeSec,
				outcome: s.outcome,
			})),
		});
	})
	.put(
		"/:date",
		zValidator(
			"json",
			z.object({
				intention: z.string().max(500).nullable().optional(),
				startedAt: z.string().nullable().optional(),
				shutdownAt: z.string().nullable().optional(),
				energyRating: z.number().int().min(1).max(5).nullable().optional(),
				wentWell: z.string().max(2000).nullable().optional(),
				gotInWay: z.string().max(2000).nullable().optional(),
				aiSummary: z.string().max(4000).nullable().optional(),
			}),
		),
		async (c) => {
			const date = dateStr.parse(c.req.param("date"));
			await upsertPlan(date, c.req.valid("json"));
			changed("day");
			const row = await db.query.dayPlans.findFirst({
				where: eq(dayPlans.date, date),
			});
			return c.json(toPlan(date, row));
		},
	)
	.put(
		"/:date/blocks",
		zValidator(
			"json",
			z.object({
				blocks: z.array(
					z.object({
						taskId: z.number().int().nullable(),
						projectId: z.number().int().nullable(),
						title: z.string().trim().min(1).max(200),
						startMin: z.number().int().min(0).max(1440),
						durationMin: z.number().int().min(5).max(720),
						kind: z.enum(["task", "meeting", "break"]),
					}),
				),
			}),
		),
		async (c) => {
			const date = dateStr.parse(c.req.param("date"));
			const { blocks } = c.req.valid("json");
			await db.transaction(async (tx) => {
				await tx.delete(timeBlocks).where(eq(timeBlocks.date, date));
				if (blocks.length)
					await tx
						.insert(timeBlocks)
						.values(blocks.map((b) => ({ ...b, date })));
			});
			changed("day");
			return c.json({ ok: true });
		},
	)
	.get("/:date/capacity", async (c) => {
		return c.json(await capacity(dateStr.parse(c.req.param("date"))));
	})
	/** AI (or template) summary for the shutdown screen. Saved on the day plan. */
	.post("/:date/summary", async (c) => {
		const date = dateStr.parse(c.req.param("date"));
		const [stats, plan, mult] = await Promise.all([
			dayStats(date),
			db.query.dayPlans.findFirst({ where: eq(dayPlans.date, date) }),
			multipliers(),
		]);
		const facts = [
			`Focused ${formatMinutes(stats.focusSec / 60)} of a ${formatMinutes(stats.targetMin)} target across ${stats.sessions} sessions.`,
			`Per project: ${stats.perProject.map((p) => `${p.name} ${formatMinutes(p.sec / 60)}`).join(", ") || "none"}.`,
			`Tasks finished: ${stats.tasksDone}. Distraction urges logged: ${stats.urges}. Interruptions: ${stats.interruptions}. Project switches: ${stats.switches}.`,
			mult.overall.value
				? `Usual estimate overrun: ${mult.overall.value}x.`
				: "",
			plan?.wentWell ? `They said went well: ${plan.wentWell}` : "",
			plan?.gotInWay ? `They said got in the way: ${plan.gotInWay}` : "",
			plan?.energyRating ? `Energy today: ${plan.energyRating}/5.` : "",
		]
			.filter(Boolean)
			.join("\n");

		let summary: string;
		let ai = false;
		if (geminiAvailable()) {
			try {
				summary = await summarizeDay(facts);
				ai = true;
			} catch {
				summary = templateSummary(stats);
			}
		} else {
			summary = templateSummary(stats);
		}
		await upsertPlan(date, { aiSummary: summary });
		changed("day");
		return c.json({ summary, ai });
	});

function templateSummary(stats: Awaited<ReturnType<typeof dayStats>>) {
	const top = stats.perProject[0];
	const pct = Math.round(
		(stats.focusSec / 60 / Math.max(1, stats.targetMin)) * 100,
	);
	return [
		`You focused for ${formatMinutes(stats.focusSec / 60)} (${pct}% of your target) and finished ${stats.tasksDone} task${stats.tasksDone === 1 ? "" : "s"}.`,
		top ? `Most of it went to ${top.name}.` : "",
		stats.urges > 2
			? `You logged ${stats.urges} urges; notice when they cluster.`
			: "",
	]
		.filter(Boolean)
		.join(" ");
}
