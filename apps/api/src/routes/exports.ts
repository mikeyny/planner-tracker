import { isAbsolute } from "node:path";
import { db, projects } from "@deep/db";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { listBackups, runBackup } from "../lib/backup";
import { writeTimesheet } from "../lib/export";
import { timesheetFor } from "../lib/insights";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = z.object({
	projectId: z.coerce.number().int().positive().nullable().optional(),
	from: dateStr,
	to: dateStr,
});

export const exportsRouter = new Hono()
	/** Timesheet rows for a project (or all billable projects) and date range. */
	.get("/timesheet", zValidator("query", range), async (c) => {
		const { projectId, from, to } = c.req.valid("query");
		if (from > to)
			throw new HTTPException(400, {
				message: "The start date is after the end date.",
			});
		return c.json(await timesheetFor(projectId ?? null, from, to));
	})
	/** Write the timesheet to a file the user picked (the API runs on this PC). */
	.post(
		"/timesheet",
		zValidator(
			"json",
			range.extend({
				format: z.enum(["csv", "pdf"]),
				path: z.string().min(3).max(1000),
			}),
		),
		async (c) => {
			const { projectId, from, to, format, path } = c.req.valid("json");
			if (!isAbsolute(path))
				throw new HTTPException(400, {
					message: "Choose where to save the file.",
				});
			const sheet = await timesheetFor(projectId ?? null, from, to);
			const project = projectId
				? await db.query.projects.findFirst({
						where: eq(projects.id, projectId),
					})
				: null;
			const title = project
				? `${project.name}${project.client && project.client !== project.name ? ` · ${project.client}` : ""}`
				: "All billable projects";
			try {
				await writeTimesheet(sheet, format, path, title);
			} catch (err) {
				throw new HTTPException(500, {
					message: `Couldn't write the file: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
			return c.json({
				path,
				rows: sheet.rows.length,
				totalMinutes: sheet.totalMinutes,
				totalAmount: sheet.totalAmount,
			});
		},
	)
	.get("/backups", (c) => c.json(listBackups()))
	.post("/backups", async (c) => {
		try {
			return c.json(await runBackup(), 201);
		} catch (err) {
			throw new HTTPException(500, {
				message: err instanceof Error ? err.message : "Backup failed.",
			});
		}
	});
