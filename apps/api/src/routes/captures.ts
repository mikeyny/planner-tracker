import { captures, db, tasks } from "@deep/db";
import type { Capture, CaptureKind } from "@deep/shared";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { changed } from "../lib/bus";
import { getOpenSessionRow, startOfLocalDay } from "../lib/state";

function toCapture(r: typeof captures.$inferSelect): Capture {
	return {
		id: r.id,
		sessionId: r.sessionId,
		projectId: r.projectId,
		text: r.text,
		kind: r.kind as CaptureKind,
		status: r.status as Capture["status"],
		createdAt: r.createdAt,
	};
}

export const capturesRouter = new Hono()
	.get("/", async (c) => {
		const status = c.req.query("status") ?? "open";
		const today = c.req.query("today") === "1";
		const rows = await db.query.captures.findMany({
			where: and(
				status === "all" ? undefined : eq(captures.status, status),
				today ? gte(captures.createdAt, startOfLocalDay()) : undefined,
			),
			orderBy: desc(captures.createdAt),
			limit: 200,
		});
		return c.json(rows.map(toCapture));
	})
	.post(
		"/",
		zValidator(
			"json",
			z.object({
				text: z.string().trim().max(500).default(""),
				kind: z.enum(["parking", "urge", "interruption"]).default("parking"),
			}),
		),
		async (c) => {
			const { text, kind } = c.req.valid("json");
			if (kind === "parking" && !text)
				throw new HTTPException(400, {
					message: "Write something to capture.",
				});
			const open = await getOpenSessionRow();
			const [row] = await db
				.insert(captures)
				.values({
					text: text || (kind === "urge" ? "Urge" : "Interruption"),
					kind,
					sessionId: open?.id ?? null,
					projectId: open?.projectId ?? null,
					// Distractions are a log, not a to-do: nothing to triage.
					status: kind === "parking" ? "open" : "triaged",
				})
				.returning();
			changed("captures");
			return c.json(toCapture(row!), 201);
		},
	)
	.patch(
		"/:id",
		zValidator(
			"json",
			z.object({
				action: z.enum(["inbox", "today", "delete", "done"]),
				date: z.string().optional(),
			}),
		),
		async (c) => {
			const id = Number(c.req.param("id"));
			const { action, date } = c.req.valid("json");
			const cap = await db.query.captures.findFirst({
				where: eq(captures.id, id),
			});
			if (!cap) throw new HTTPException(404, { message: "Capture not found." });
			let taskId: number | null = null;
			if (action === "inbox" || action === "today") {
				const [max] = await db
					.select({ v: sql<number>`coalesce(max(${tasks.sortOrder}), 0)::int` })
					.from(tasks);
				const [task] = await db
					.insert(tasks)
					.values({
						title: cap.text,
						projectId: cap.projectId,
						plannedFor: action === "today" ? (date ?? null) : null,
						sortOrder: Number(max?.v ?? 0) + 1,
					})
					.returning();
				taskId = task!.id;
				changed("tasks");
			}
			await db
				.update(captures)
				.set({ status: action === "delete" ? "deleted" : "triaged", taskId })
				.where(eq(captures.id, id));
			changed("captures");
			return c.json({ ok: true, taskId });
		},
	);
