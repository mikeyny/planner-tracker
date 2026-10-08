import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
	process.env.DATABASE_URL || "postgres://deep:deep@127.0.0.1:5434/deep";

export const sql = postgres(connectionString, { max: 5, onnotice: () => {} });

export const db = drizzle(sql, { schema });

export type Database = typeof db;

/** Apply pending migrations from packages/db/drizzle. */
export async function runMigrations() {
	await migrate(db, {
		migrationsFolder: join(import.meta.dir, "..", "drizzle"),
	});
}

export * from "./schema";
