/**
 * Extra rows the UI tests need on top of the demo seed:
 * a task that has slipped twice, and this repo linked as a project (for commit markers).
 * Refuses to run against anything but a *_test database.
 */
import { resolve } from "node:path";
import { db, projectPaths, projects, sql, tasks } from "@deep/db";
import { addDays, localDate } from "@deep/shared";

const name = new URL(
	process.env.DATABASE_URL ?? "postgres://x/deep",
).pathname.slice(1);
if (!name.endsWith("_test")) {
	console.error(
		`Refusing to touch "${name}": e2e fixtures only go into a *_test database.`,
	);
	process.exit(1);
}

const smp = await db.query.projects.findFirst({
	where: (p, { eq }) => eq(p.name, "SMP"),
});
await db.insert(tasks).values({
	projectId: smp?.id ?? null,
	title: "Refactor the invoice generator",
	estimateMin: 120,
	plannedFor: addDays(localDate(), -1),
	rolloverCount: 2,
	sortOrder: 999,
});
const [deep] = await db
	.insert(projects)
	.values({ name: "Deep", color: "#e66767", sortOrder: 9 })
	.returning();
const repo = resolve(import.meta.dir, "..", "..", "..")
	.replace(/\\/g, "/")
	.toLowerCase();
await db.insert(projectPaths).values({ projectId: deep!.id, path: repo });
console.log(`fixtures added (${repo})`);
await sql.end();
