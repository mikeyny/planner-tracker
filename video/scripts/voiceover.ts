/**
 * Generate narration with Gemini text-to-speech: one WAV per scene in public/vo,
 * plus src/voiceover.json with each clip's duration. Unchanged scenes are skipped.
 *   bun run voiceover            (needs GEMINI_API_KEY in the repo .env)
 *
 * Notes:
 * - The free tier allows about 10 TTS requests per model per day. Set TTS_MODEL to
 *   another TTS model to continue, but keep one model per video so the voice matches.
 * - Gemini 3.x TTS models read everything aloud, so only the scene's own text is sent.
 * - `bun scripts/vo-check.ts` transcribes each clip with local Whisper to verify it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { SCRIPT } from "../src/script";

const MODEL = process.env.TTS_MODEL || "gemini-3.8-flash-tts";
const VOICE = process.env.TTS_VOICE || "Charon";
const STYLE =
	"calm, warm and clear, like a friendly product walkthrough, at a relaxed pace";

const root = join(import.meta.dir, "..");
const outDir = join(root, "public", "vo");
const manifestPath = join(root, "src", "voiceover.json");
mkdirSync(outDir, { recursive: true });

type Entry = { id: string; file: string; seconds: number; hash: string };
const previous: Entry[] = existsSync(manifestPath)
	? JSON.parse(readFileSync(manifestPath, "utf8"))
	: [];
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function wav(pcm: Int16Array, rate: number) {
	const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
	const h = Buffer.alloc(44);
	h.write("RIFF", 0);
	h.writeUInt32LE(36 + data.length, 4);
	h.write("WAVE", 8);
	h.write("fmt ", 12);
	h.writeUInt32LE(16, 16);
	h.writeUInt16LE(1, 20);
	h.writeUInt16LE(1, 22);
	h.writeUInt32LE(rate, 24);
	h.writeUInt32LE(rate * 2, 28);
	h.writeUInt16LE(2, 32);
	h.writeUInt16LE(16, 34);
	h.write("data", 36);
	h.writeUInt32LE(data.length, 40);
	return Buffer.concat([h, data]);
}

async function speak(
	prompt: string,
): Promise<{ pcm: Int16Array; rate: number }> {
	for (let attempt = 1; ; attempt++) {
		try {
			const res = await ai.models.generateContent({
				model: MODEL,
				contents: prompt,
				config: {
					responseModalities: ["AUDIO"],
					speechConfig: {
						voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
					},
				},
			});
			const part = res.candidates?.[0]?.content?.parts?.[0]?.inlineData;
			if (!part?.data) throw new Error("no audio in response");
			const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? "")?.[1] ?? 24000);
			const buf = Buffer.from(part.data, "base64");
			const pcm = new Int16Array(
				buf.buffer,
				buf.byteOffset,
				Math.floor(buf.byteLength / 2),
			);
			return { pcm: pcm.slice(), rate };
		} catch (err) {
			const msg = (err as Error).message;
			if (attempt >= 3 || msg.includes("RESOURCE_EXHAUSTED")) throw err;
			console.warn(`  retry: ${msg.slice(0, 120)}`);
			await Bun.sleep(5000 * attempt);
		}
	}
}

/** Loudness per 20 ms window. */
function envelope(pcm: Int16Array, rate: number) {
	const win = Math.round(rate * 0.02);
	const out: number[] = [];
	for (let i = 0; i < pcm.length; i += win) {
		let sum = 0;
		const end = Math.min(pcm.length, i + win);
		for (let j = i; j < end; j++) sum += (pcm[j]! / 32768) ** 2;
		out.push(Math.sqrt(sum / Math.max(1, end - i)));
	}
	return { env: out, win };
}

const QUIET = 0.008;

/** Trim silence at both ends, keeping a short natural tail. */
function trim(pcm: Int16Array, rate: number) {
	const { env, win } = envelope(pcm, rate);
	let a = 0;
	while (a < env.length && env[a]! < QUIET) a++;
	let b = env.length - 1;
	while (b > a && env[b]! < QUIET) b--;
	const pad = Math.round(rate * 0.12);
	return pcm.slice(
		Math.max(0, a * win - pad),
		Math.min(pcm.length, (b + 1) * win + pad),
	);
}

const hashOf = (text: string) =>
	createHash("sha1")
		.update(`${MODEL}|${VOICE}|${STYLE}|${text}`)
		.digest("hex")
		.slice(0, 12);

const manifest: Entry[] = SCRIPT.map(({ id, text }) => {
	const old = previous.find((p) => p.id === id);
	return old?.hash === hashOf(text) &&
		existsSync(join(root, "public", old.file))
		? old
		: { id, file: `vo/${id}.wav`, seconds: 0, hash: "" };
});
const save = () =>
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

for (const [idx, scene] of SCRIPT.entries()) {
	if (manifest[idx]!.hash === hashOf(scene.text)) {
		console.log(`= ${scene.id} (unchanged)`);
		continue;
	}
	const t = Date.now();
	const { pcm, rate } = await speak(scene.text);
	const clip = trim(pcm, rate);
	const file = `vo/${scene.id}.wav`;
	writeFileSync(join(root, "public", file), wav(clip, rate));
	manifest[idx] = {
		id: scene.id,
		file,
		seconds: clip.length / rate,
		hash: hashOf(scene.text),
	};
	console.log(
		`+ ${scene.id} ${(clip.length / rate).toFixed(1)}s (${Date.now() - t} ms)`,
	);
	save();
}
save();
console.log(
	`total ${manifest.reduce((a, m) => a + m.seconds, 0).toFixed(1)}s of narration`,
);
