import { existsSync } from "node:fs";
import { join } from "node:path";
import { db, projects } from "@deep/db";
import { addDays, type Commit } from "@deep/shared";
import { ne } from "drizzle-orm";
import { startOfLocalDay } from "./state";

let authorEmail: string | null | undefined;

async function run(args: string[]): Promise<string> {
	const proc = Bun.spawn(["git", ...args], {
		stdout: "pipe",
		stderr: "ignore",
		windowsHide: true,
	});
	const [out] = await Promise.all([
		new Response(proc.stdout).text(),
		proc.exited,
	]);
	return out;
}

/** Your git email, so only your own commits show on the timeline. */
async function me() {
	if (authorEmail === undefined) {
		authorEmail =
			(await run(["config", "--global", "user.email"])).trim() || null;
	}
	return authorEmail;
}

const cache = new Map<string, { at: number; commits: Commit[] }>();
const CACHE_MS = 60_000;

/** Your commits on `date` across every linked repo folder, oldest first. */
export async function commitsOn(date: string): Promise<Commit[]> {
	const hit = cache.get(date);
	if (hit && Date.now() - hit.at < CACHE_MS) return hit.commits;

	const [paths, projectRows, email] = await Promise.all([
		db.query.projectPaths.findMany(),
		db.query.projects.findMany({ where: ne(projects.status, "archived") }),
		me(),
	]);
	const colorOf = new Map(projectRows.map((p) => [p.id, p.color]));
	const since = startOfLocalDay(date);
	const until = startOfLocalDay(addDays(date, 1));

	const results = await Promise.all(
		paths
			.filter(
				(p) => colorOf.has(p.projectId) && existsSync(join(p.path, ".git")),
			)
			.map(async (p) => {
				const out = await run([
					"-C",
					p.path,
					"log",
					"--all",
					`--since=${since}`,
					`--until=${until}`,
					...(email ? [`--author=${email}`] : []),
					"--format=%H%x1f%cI%x1f%s",
				]);
				return out
					.split("\n")
					.filter(Boolean)
					.map((line) => {
						const [hash = "", at = "", subject = ""] = line.split("\x1f");
						return {
							projectId: p.projectId,
							color: colorOf.get(p.projectId)!,
							hash: hash.slice(0, 8),
							subject,
							at: new Date(at).toISOString(),
						};
					});
			}),
	);
	// The same commit can show up through two linked folders of one repo.
	const seen = new Set<string>();
	const commits = results
		.flat()
		.filter((c) => !seen.has(c.hash) && seen.add(c.hash))
		.sort((a, b) => a.at.localeCompare(b.at));
	cache.set(date, { at: Date.now(), commits });
	return commits;
}
