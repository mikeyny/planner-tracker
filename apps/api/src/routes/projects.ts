import { db, projectPaths, projects } from "@deep/db";
import { zValidator } from "@hono/zod-validator";
import { asc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { changed } from "../lib/bus";
import { normalizePath } from "../lib/paths";
import { toProject } from "../lib/serialize";

const projectInput = z.object({
	name: z.string().trim().min(1).max(80),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
	icon: z.string().max(8).nullable().optional(),
	status: z.enum(["active", "paused", "archived"]).optional(),
	client: z.string().trim().max(80).nullable().optional(),
	billable: z.boolean().optional(),
	hourlyRate: z.number().min(0).nullable().optional(),
	weeklyTargetMin: z.number().int().min(0).nullable().optional(),
	leftOffNote: z.string().max(2000).nullable().optional(),
	paths: z.array(z.string().trim().min(1)).optional(),
});

async function setPaths(projectId: number, paths: string[]) {
	await db.delete(projectPaths).where(eq(projectPaths.projectId, projectId));
	const unique = [...new Set(paths.map(normalizePath).filter(Boolean))];
	if (unique.length === 0) return;
	// A folder can belong to one project only; the latest assignment wins.
	for (const path of unique) {
		await db.delete(projectPaths).where(eq(projectPaths.path, path));
	}
	await db
		.insert(projectPaths)
		.values(unique.map((path) => ({ projectId, path })));
}

async function loadProject(id: number) {
	const row = await db.query.projects.findFirst({ where: eq(projects.id, id) });
	if (!row) throw new HTTPException(404, { message: "Project not found." });
	const paths = await db.query.projectPaths.findMany({
		where: eq(projectPaths.projectId, id),
	});
	return toProject(
		row,
		paths.map((p) => p.path),
	);
}

export const projectsRouter = new Hono()
	.get("/", async (c) => {
		const all = c.req.query("all") === "1";
		const rows = await db.query.projects.findMany({
			where: all ? undefined : ne(projects.status, "archived"),
			orderBy: [asc(projects.sortOrder), asc(projects.id)],
		});
		const paths = await db.query.projectPaths.findMany();
		return c.json(
			rows.map((r) =>
				toProject(
					r,
					paths.filter((p) => p.projectId === r.id).map((p) => p.path),
				),
			),
		);
	})
	.post("/", zValidator("json", projectInput), async (c) => {
		const { paths, ...input } = c.req.valid("json");
		const [row] = await db.insert(projects).values(input).returning();
		if (paths) await setPaths(row!.id, paths);
		changed("projects");
		return c.json(await loadProject(row!.id), 201);
	})
	.patch("/:id", zValidator("json", projectInput.partial()), async (c) => {
		const id = Number(c.req.param("id"));
		const { paths, ...input } = c.req.valid("json");
		if (Object.keys(input).length > 0) {
			await db.update(projects).set(input).where(eq(projects.id, id));
		}
		if (paths) await setPaths(id, paths);
		changed("projects");
		return c.json(await loadProject(id));
	})
	.delete("/:id", async (c) => {
		const id = Number(c.req.param("id"));
		await db
			.update(projects)
			.set({ status: "archived" })
			.where(eq(projects.id, id));
		changed("projects");
		return c.json({ ok: true });
	});
