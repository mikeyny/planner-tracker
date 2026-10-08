import { db } from "@deep/db";

/** "C:\\Users\\Me\\dev\\smp\\" -> "c:/users/me/dev/smp" */
export function normalizePath(p: string): string {
	return p.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Find the project whose linked folder contains `path`.
 * The longest (most specific) linked folder wins.
 */
export async function projectForPath(path: string): Promise<number | null> {
	const target = normalizePath(path);
	const rows = await db.query.projectPaths.findMany();
	let best: { projectId: number; len: number } | null = null;
	for (const r of rows) {
		if (target === r.path || target.startsWith(`${r.path}/`)) {
			if (!best || r.path.length > best.len)
				best = { projectId: r.projectId, len: r.path.length };
		}
	}
	return best?.projectId ?? null;
}
