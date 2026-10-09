import {
	mkdirSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type BackupInfo, localDate } from "@deep/shared";
import { getSettings } from "./settings";

export const BACKUP_DIR =
	process.env.DEEP_BACKUP_DIR || join(homedir(), ".deep", "backups");
const CONTAINER = process.env.POSTGRES_CONTAINER || "deep_postgres";
const DB_URL = new URL(
	process.env.DATABASE_URL || "postgres://deep:deep@127.0.0.1:5434/deep",
);
const DB_NAME = DB_URL.pathname.slice(1) || "deep";
const DB_USER = decodeURIComponent(DB_URL.username) || "deep";
const PREFIX = "deep-";

export function listBackups(): BackupInfo[] {
	mkdirSync(BACKUP_DIR, { recursive: true });
	return readdirSync(BACKUP_DIR)
		.filter((f) => f.startsWith(PREFIX) && f.endsWith(".sql.gz"))
		.map((file) => {
			const path = join(BACKUP_DIR, file);
			const st = statSync(path);
			return { file, path, bytes: st.size, createdAt: st.mtime.toISOString() };
		})
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** pg_dump inside the Postgres container, gzipped to ~/.deep/backups/deep-YYYY-MM-DD[-HHMM].sql.gz */
export async function runBackup(): Promise<BackupInfo> {
	mkdirSync(BACKUP_DIR, { recursive: true });
	const proc = Bun.spawn(
		[
			"docker",
			"exec",
			CONTAINER,
			"pg_dump",
			"-U",
			DB_USER,
			"-d",
			DB_NAME,
			"--clean",
			"--if-exists",
			"--no-owner",
		],
		{ stdout: "pipe", stderr: "pipe", windowsHide: true },
	);
	const [sql, err, code] = await Promise.all([
		new Response(proc.stdout).arrayBuffer(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0 || sql.byteLength === 0) {
		throw new Error(`pg_dump failed (${code}): ${err.trim() || "no output"}`);
	}
	const now = new Date();
	const today = localDate(now);
	const exists = listBackups().some(
		(b) => b.file === `${PREFIX}${today}.sql.gz`,
	);
	// One file per day; a manual backup later the same day gets a time suffix.
	const stamp = exists
		? `${today}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`
		: today;
	const file = `${PREFIX}${stamp}.sql.gz`;
	const path = join(BACKUP_DIR, file);
	writeFileSync(path, Bun.gzipSync(new Uint8Array(sql)));
	await prune();
	const st = statSync(path);
	return { file, path, bytes: st.size, createdAt: st.mtime.toISOString() };
}

async function prune() {
	const keep = (await getSettings()).backupsKeep;
	for (const b of listBackups().slice(keep)) {
		try {
			unlinkSync(b.path);
		} catch {
			// A locked file stays until next time.
		}
	}
}

/** Make sure there's a backup for today; checked at start-up and every hour. */
export function startBackupJob() {
	const check = async () => {
		const today = localDate();
		if (listBackups().some((b) => b.file.startsWith(`${PREFIX}${today}`)))
			return;
		try {
			const b = await runBackup();
			console.log(
				`[backup] wrote ${b.file} (${Math.round(b.bytes / 1024)} KB)`,
			);
		} catch (err) {
			console.error(
				"[backup] failed:",
				err instanceof Error ? err.message : err,
			);
		}
	};
	setTimeout(check, 30_000);
	setInterval(check, 60 * 60 * 1000);
}
