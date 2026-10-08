import { db, tasks } from "@deep/db";
import { localDate } from "@deep/shared";
import { zValidator } from "@hono/zod-validator";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { AiError, breakdownTask, geminiAvailable } from "../lib/ai";
import { changed } from "../lib/bus";
import { toTask, withSpent } from "../lib/serialize";
import { startOfLocalDay } from "../lib/state";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const taskInput = z.object({
	title: z.string().trim().min(1).max(300),
	projectId: z.number().int().nullable().optional(),
	notes: z.string().max(10_000).nullable().optional(),
	nextAction: z.string().max(300).nullable().optional(),
	status: z.enum(["open", "done", "dropped"]).optional(),
	isTop3: z.boolean().optional(),
	energy: z.enum(["deep", "shallow", "admin"]).nullable().optional(),
	estimateMin: z.number().int().min(0).max(1440).nullable().optional(),
	plannedFor: dateStr.nullable().optional(),
	dueDate: dateStr.nullable().optional(),
	parentTaskId: z.number().int().nullable().optional(),
	sortOrder: z.number().int().optional(),
});

async function nextSortOrder() {
	const [row] = await db
		.select({ max: sql<number>`coalesce(max(${tasks.sortOrder}), 0)::int` })
		.from(tasks);
	return Number(row?.max ?? 0) + 1;
}

/** doneAt follows status so "done today" queries stay correct. */
function withDoneAt<T extends { status?: string }>(input: T) {
	if (input.status === "done")
		return { ...input, doneAt: new Date().toISOString() };
	if (input.status === "open") return { ...input, doneAt: null };
	return input;
}

export const tasksRouter = new Hono()
	.get("/", async (c) => {
		const view = c.req.query("view") ?? "today";
		const date = c.req.query("date") ?? localDate();
		const projectId = c.req.query("projectId");
		const byProject = projectId
			? eq(tasks.projectId, Number(projectId))
			: undefined;

		let where: ReturnType<typeof and>;
		if (view === "today") {
			const dayStart = startOfLocalDay(date);
			const dayEnd = startOfLocalDay(
				localDate(new Date(Date.parse(dayStart) + 36 * 3600 * 1000)),
			);
			where = and(
				byProject,
				or(
					and(eq(tasks.plannedFor, date), eq(tasks.status, "open")),
					and(
						eq(tasks.status, "done"),
						gte(tasks.doneAt, dayStart),
						lt(tasks.doneAt, dayEnd),
					),
				),
			);
		} else if (view === "inbox") {
			where = and(
				byProject,
				isNull(tasks.plannedFor),
				eq(tasks.status, "open"),
			);
		} else if (view === "overdue") {
			where = and(
				byProject,
				lt(tasks.plannedFor, date),
				eq(tasks.status, "open"),
			);
		} else if (view === "upcoming") {
			where = and(
				byProject,
				gte(tasks.plannedFor, date),
				eq(tasks.status, "open"),
			);
		} else if (view === "done") {
			where = and(byProject, eq(tasks.status, "done"));
		} else {
			where = and(byProject, eq(tasks.status, "open"));
		}

		const rows = await db.query.tasks.findMany({
			where,
			orderBy: [desc(tasks.isTop3), asc(tasks.sortOrder), asc(tasks.id)],
			limit: view === "done" ? 200 : 500,
		});
		return c.json(await withSpent(rows));
	})
	.post("/", zValidator("json", taskInput), async (c) => {
		const input = withDoneAt(c.req.valid("json"));
		const [row] = await db
			.insert(tasks)
			.values({ sortOrder: await nextSortOrder(), ...input })
			.returning();
		changed("tasks");
		return c.json(toTask(row!), 201);
	})
	.post(
		"/bulk",
		zValidator("json", z.object({ tasks: z.array(taskInput).min(1).max(50) })),
		async (c) => {
			let order = await nextSortOrder();
			const rows = await db
				.insert(tasks)
				.values(
					c.req.valid("json").tasks.map((t) => ({ sortOrder: order++, ...t })),
				)
				.returning();
			changed("tasks");
			return c.json(
				rows.map((r) => toTask(r)),
				201,
			);
		},
	)
	.post(
		"/reorder",
		zValidator("json", z.object({ ids: z.array(z.number().int()) })),
		async (c) => {
			const { ids } = c.req.valid("json");
			await Promise.all(
				ids.map((id, i) =>
					db
						.update(tasks)
						.set({ sortOrder: i + 1 })
						.where(eq(tasks.id, id)),
				),
			);
			changed("tasks");
			return c.json({ ok: true });
		},
	)
	.post(
		"/rollover",
		zValidator(
			"json",
			z.object({
				date: dateStr,
				ids: z.array(z.number().int()).min(1),
				action: z.enum(["today", "inbox", "drop"]),
			}),
		),
		async (c) => {
			const { date, ids, action } = c.req.valid("json");
			if (action === "today") {
				await db
					.update(tasks)
					.set({
						plannedFor: date,
						rolloverCount: sql`${tasks.rolloverCount} + 1`,
					})
					.where(inArray(tasks.id, ids));
			} else if (action === "inbox") {
				await db
					.update(tasks)
					.set({ plannedFor: null, isTop3: false })
					.where(inArray(tasks.id, ids));
			} else {
				await db
					.update(tasks)
					.set({ status: "dropped" })
					.where(inArray(tasks.id, ids));
			}
			changed("tasks");
			return c.json({ ok: true });
		},
	)
	.patch("/:id", zValidator("json", taskInput.partial()), async (c) => {
		const id = Number(c.req.param("id"));
		const [row] = await db
			.update(tasks)
			.set(withDoneAt(c.req.valid("json")))
			.where(eq(tasks.id, id))
			.returning();
		if (!row) throw new HTTPException(404, { message: "Task not found." });
		changed("tasks");
		return c.json(toTask(row));
	})
	.delete("/:id", async (c) => {
		await db.delete(tasks).where(eq(tasks.id, Number(c.req.param("id"))));
		changed("tasks");
		return c.json({ ok: true });
	})
	/** AI: suggest smaller steps. Doesn't save anything. */
	.post("/:id/breakdown", async (c) => {
		const task = await db.query.tasks.findFirst({
			where: eq(tasks.id, Number(c.req.param("id"))),
		});
		if (!task) throw new HTTPException(404, { message: "Task not found." });
		if (!geminiAvailable())
			throw new HTTPException(503, {
				message: "Add a Gemini API key in .env to use Make it smaller.",
			});
		try {
			return c.json(
				await breakdownTask(task.title, task.notes, task.estimateMin),
			);
		} catch (err) {
			throw new HTTPException(502, {
				message: err instanceof AiError ? err.message : "AI request failed.",
			});
		}
	})
	/** Replace a task with the given steps (same project, day and top-3 flag). */
	.post(
		"/:id/split",
		zValidator(
			"json",
			z.object({
				steps: z
					.array(
						z.object({
							title: z.string().trim().min(1),
							estimateMin: z.number().int(),
						}),
					)
					.min(1),
			}),
		),
		async (c) => {
			const id = Number(c.req.param("id"));
			const parent = await db.query.tasks.findFirst({
				where: eq(tasks.id, id),
			});
			if (!parent) throw new HTTPException(404, { message: "Task not found." });
			let order = parent.sortOrder;
			const rows = await db
				.insert(tasks)
				.values(
					c.req.valid("json").steps.map((s, i) => ({
						title: s.title,
						estimateMin: s.estimateMin,
						projectId: parent.projectId,
						plannedFor: parent.plannedFor,
						energy: parent.energy,
						isTop3: parent.isTop3 && i === 0,
						parentTaskId: parent.id,
						sortOrder: order++,
					})),
				)
				.returning();
			await db
				.update(tasks)
				.set({ status: "dropped", isTop3: false })
				.where(eq(tasks.id, id));
			changed("tasks");
			return c.json(rows.map((r) => toTask(r)));
		},
	);
