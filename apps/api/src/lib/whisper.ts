import { existsSync } from "node:fs";
import { cpus } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { Subprocess } from "bun";

/** Repo root: apps/api/src/lib -> ../../../.. */
const ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

function fromRoot(p: string) {
	return isAbsolute(p) ? p : join(ROOT, p);
}

const EXE =
	process.platform === "win32" ? "whisper-server.exe" : "whisper-server";
/** CUDA build (fast, NVIDIA GPU). Used when present; the CPU build is the fallback. */
const GPU_DIR = fromRoot(
	process.env.WHISPER_GPU_DIR || "tools/whisper/bin-cuda",
);
const CPU_DIR = fromRoot(process.env.WHISPER_DIR || "tools/whisper/bin");
const MODEL = fromRoot(
	process.env.WHISPER_MODEL || "tools/whisper/ggml-large-v3-turbo-q5_0.bin",
);
const PORT = Number(process.env.WHISPER_PORT || 4041);

export type WhisperBackend = "gpu" | "cpu";
/** Set when the GPU build failed to start (no driver, out of VRAM): stay on CPU. */
let gpuFailed = false;
let backend: WhisperBackend | null = null;

function candidates(): { backend: WhisperBackend; dir: string }[] {
	const out: { backend: WhisperBackend; dir: string }[] = [];
	if (!gpuFailed && existsSync(join(GPU_DIR, EXE)))
		out.push({ backend: "gpu", dir: GPU_DIR });
	if (existsSync(join(CPU_DIR, EXE)))
		out.push({ backend: "cpu", dir: CPU_DIR });
	return out;
}
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
	if (candidates().length === 0 || !existsSync(MODEL)) return "missing";
	if (starting) return "starting";
	return proc && proc.exitCode === null ? "ready" : "stopped";
}

export function whisperModelName() {
	return existsSync(MODEL) ? basename(MODEL) : null;
}

/** Which build is loaded, or would load next ("gpu" when the CUDA build is installed). */
export function whisperBackend(): WhisperBackend | null {
	if (proc && proc.exitCode === null && backend) return backend;
	return candidates()[0]?.backend ?? null;
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
			`Whisper isn't installed. Expected ${join(CPU_DIR, EXE)} and ${MODEL}.`,
		);
	// Reuse any healthy server on the port (ours, or one started by another process).
	if (await healthy()) return;
	if (starting) return starting;

	starting = (async () => {
		let lastError: unknown = null;
		for (const c of candidates()) {
			try {
				await launch(c.dir, c.backend);
				backend = c.backend;
				lastError = null;
				break;
			} catch (err) {
				lastError = err;
				stopWhisper();
				if (c.backend === "gpu") {
					gpuFailed = true;
					console.warn("[whisper] GPU build failed, using the CPU build:", err);
				}
			}
		}
		if (lastError) throw lastError;
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

async function launch(dir: string, which: WhisperBackend) {
	proc = Bun.spawn(
		[
			join(dir, EXE),
			"-m",
			MODEL,
			"--host",
			"127.0.0.1",
			"--port",
			String(PORT),
			"-t",
			String(which === "gpu" ? 4 : THREADS),
		],
		{ cwd: dir, stdout: "ignore", stderr: "ignore", windowsHide: true },
	);
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if (proc.exitCode !== null)
			throw new Error("Whisper server exited during start-up.");
		if (await healthy()) return;
		await Bun.sleep(250);
	}
	throw new Error("Whisper server didn't start within 60 seconds.");
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
	const run = async (): Promise<string> => {
		try {
			return await request();
		} catch (err) {
			// The GPU server died mid-request (driver reset, out of VRAM): retry once on CPU.
			if (backend !== "gpu" || (proc && proc.exitCode === null)) throw err;
			console.warn(
				"[whisper] GPU server stopped, switching to the CPU build:",
				err,
			);
			gpuFailed = true;
			stopWhisper();
			await ensureWhisper();
			return request();
		}
	};
	const request = async () => {
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
