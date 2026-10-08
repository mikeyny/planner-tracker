import { db, settings } from "@deep/db";
import { DEFAULT_SETTINGS, type Settings } from "@deep/shared";

const KEY = "app";
let cache: Settings | null = null;

export async function getSettings(): Promise<Settings> {
	if (cache) return cache;
	const row = await db.query.settings.findFirst({
		where: (s, { eq }) => eq(s.key, KEY),
	});
	cache = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
	return cache;
}

export async function updateSettings(
	patch: Partial<Settings>,
): Promise<Settings> {
	const next = { ...(await getSettings()), ...patch };
	await db
		.insert(settings)
		.values({ key: KEY, value: next })
		.onConflictDoUpdate({ target: settings.key, set: { value: next } });
	cache = next;
	return next;
}
