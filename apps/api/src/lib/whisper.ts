import { existsSync } from "node:fs";
import { cpus } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { Subprocess } from "bun";

/** Repo root: apps/api/src/lib -> ../../../.. */
const ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

function fromRoot(p: string) {
	return isAbsolute(p) ? p : join(ROOT, p);
}

const DIR = fromRoot(process.env.WHISPER_DIR || "tools/whisper/bin");
const MODEL = fromRoot(
	process.env.WHISPER_MODEL || "tools/whisper/ggml-large-v3-turbo-q5_0.bin",
);
const PORT = Number(process.env.WHISPER_PORT || 4041);
const SERVER_EXE = join(
	DIR,
	process.platform === "win32" ? "whisper-server.exe" : "whisper-server",
);
/** Free the model's RAM after this long without a transcription. */
const IDLE_SHUTDOWN_MS = 15 * 60 * 1000;
const THREADS = Math.max(4, Math.min(12, cpus().length - 4));

let proc: Subprocess | null = null;
let starting: Promise<void> | null = null;
let lastUsed = 0;
let idleTimer: ReturnType<typeof setInterval> | null = null;
/** whisper-server handles one request at a time; queue ours. */
let queue: Promise<unknown> = Promise.resolve();

export type WhisperStatus = "ready" | "stopped" | "starting" | "missing";

export function whisperStatus(): WhisperStatus {
	if (!existsSync(SERVER_EXE) || !existsSync(MODEL)) return "missing";
	if (starting) return "starting";
	return proc && proc.exitCode === null ? "ready" : "stopped";
}

export function whisperModelName() {
	return existsSync(MODEL) ? basename(MODEL) : null;
}

async function healthy(): Promise<boolean> {
	try {
		const res = await fetch(`http://127.0.0.1:${PORT}/health`, {
			signal: AbortSignal.timeout(1000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function ensureWhisper(): Promise<void> {
	if (whisperStatus() === "missing")
		throw new Error(
			`Whisper isn't installed. Expected ${SERVER_EXE} and ${MODEL}.`,
		);
	// Reuse any healthy server on the port (ours, or one started by another process).
	if (await healthy()) return;
	if (starting) return starting;

	starting = (async () => {
		proc = Bun.spawn(
			[
				SERVER_EXE,
				"-m",
				MODEL,
				"--host",
				"127.0.0.1",
				"--port",
				String(PORT),
				"-t",
				String(THREADS),
			],
			{ cwd: DIR, stdout: "ignore", stderr: "ignore", windowsHide: true },
		);
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			if (proc.exitCode !== null)
				throw new Error("Whisper server exited during start-up.");
			if (await healthy()) break;
			await Bun.sleep(250);
		}
		if (!(await healthy()))
			throw new Error("Whisper server didn't start within 60 seconds.");
		lastUsed = Date.now();
		if (!idleTimer) {
			idleTimer = setInterval(() => {
				if (proc && Date.now() - lastUsed > IDLE_SHUTDOWN_MS) stopWhisper();
			}, 60_000);
		}
	})().finally(() => {
		starting = null;
	});
	return starting;
}

export function stopWhisper() {
	if (proc && proc.exitCode === null) proc.kill();
	proc = null;
}

/** Transcribe a 16 kHz mono WAV. `prompt` biases spelling (project names etc). */
export async function transcribe(
	wav: Blob,
	opts: { language?: string; prompt?: string } = {},
): Promise<string> {
	await ensureWhisper();
	const run = async () => {
		const form = new FormData();
		form.append("file", wav, "audio.wav");
		form.append("response_format", "json");
		form.append("temperature", "0.0");
		form.append("language", opts.language || "en");
		if (opts.prompt) form.append("prompt", opts.prompt);
		const res = await fetch(`http://127.0.0.1:${PORT}/inference`, {
			method: "POST",
			body: form,
			signal: AbortSignal.timeout(120_000),
		});
		lastUsed = Date.now();
		if (!res.ok)
			throw new Error(`Whisper failed (${res.status}): ${await res.text()}`);
		const json = (await res.json()) as { text?: string };
		return cleanTranscript(json.text ?? "");
	};
	const p = queue.then(run, run);
	queue = p.catch(() => {});
	return p;
}

/** Drop whisper's silence markers like "[BLANK_AUDIO]" and tidy spacing. */
function cleanTranscript(text: string) {
	return text
		.replace(/\[(BLANK_AUDIO|MUSIC|NOISE|SILENCE)[^\]]*\]/gi, "")
		.replace(/\(\s*(silence|music|noise)\s*\)/gi, "")
		.replace(/\s+/g, " ")
		.trim();
}

process.on("exit", stopWhisper);
