import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { db } from "@deep/db";
import type { DiscoveredProject } from "@deep/shared";
import { normalizePath } from "./paths";
import { getSettings } from "./settings";

/** Default root: the folder that contains this repo's parent (e.g. ~/Documents/dev/techvest). */
const DEFAULT_ROOT = resolve(
	import.meta.dir,
	"..",
	"..",
	"..",
	"..",
	"..",
	"..",
);
const SKIP = new Set([
	"node_modules",
	"dist",
	"build",
	"out",
	"target",
	"vendor",
]);

export async function projectsRoot() {
	return (await getSettings()).projectsRoot || DEFAULT_ROOT;
}

function kindOf(dir: string): DiscoveredProject["kind"] | null {
	if (existsSync(join(dir, ".git"))) return "git";
	if (existsSync(join(dir, "package.json"))) return "package";
	return null;
}

function subdirs(dir: string): string[] {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter(
				(d) => d.isDirectory() && !d.name.startsWith(".") && !SKIP.has(d.name),
			)
			.map((d) => join(dir, d.name));
	} catch {
		return [];
	}
}

/**
 * Repos under the root, two levels deep: `techvest/smp` and `techvest/ai-sites/cloudhs`.
 * A folder that is itself a repo isn't searched further. Already-linked folders are left out.
 */
export async function discoverProjects(
	root?: string,
): Promise<{ root: string; found: DiscoveredProject[] }> {
	const base = root || (await projectsRoot());
	const linked = new Set(
		(await db.query.projectPaths.findMany()).map((p) => p.path),
	);
	const found: DiscoveredProject[] = [];

	const consider = (dir: string) => {
		const kind = kindOf(dir);
		if (!kind) return false;
		if (!linked.has(normalizePath(dir))) {
			found.push({
				name: basename(dir),
				path: dir,
				kind,
				modifiedAt: statSync(dir).mtime.toISOString(),
			});
		}
		return true;
	};

	for (const dir of subdirs(base)) {
		if (consider(dir)) continue;
		for (const child of subdirs(dir)) consider(child);
	}
	found.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
	return { root: base, found };
}
