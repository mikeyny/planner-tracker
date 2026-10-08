/**
 * Re-split paired narration using Whisper timestamps.
 * The pair recordings are rebuilt by joining each pair's two clips, transcribed locally
 * (whisper-server on :4041, started by the Deep API), and cut where passage two begins.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SCRIPT } from "../src/script";

const root = join(import.meta.dir, "..");
const manifestPath = join(root, "src", "voiceover.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
	id: string;
	file: string;
	seconds: number;
	hash: string;
}[];
const dryRun = process.argv.includes("--dry");
const only = process.argv.find((a) => a.startsWith("--pair="))?.slice(7);

function readWav(file: string) {
	const buf = readFileSync(join(root, "public", file));
	const rate = buf.readUInt32LE(24);
	const pcm = new Int16Array(
		buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + buf.length),
	);
	return { pcm, rate };
}

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

/** Whisper wants 16 kHz; downsample by simple averaging (24k → 16k). */
function to16k(pcm: Int16Array, rate: number) {
	const ratio = rate / 16000;
	const out = new Int16Array(Math.floor(pcm.length / ratio));
	for (let i = 0; i < out.length; i++) out[i] = pcm[Math.floor(i * ratio)]!;
	return out;
}

interface Seg {
	start: number;
	end: number;
	text: string;
}

async function transcribe(pcm16: Int16Array): Promise<Seg[]> {
	const form = new FormData();
	form.append(
		"file",
		new Blob([wav(pcm16, 16000)], { type: "audio/wav" }),
		"pair.wav",
	);
	form.append("response_format", "verbose_json");
	form.append("language", "en");
	form.append("max_len", "1");
	form.append("split_on_word", "true");
	const res = await fetch("http://127.0.0.1:4041/inference", {
		method: "POST",
		body: form,
	});
	if (!res.ok) throw new Error(`whisper ${res.status}: ${await res.text()}`);
	const json = (await res.json()) as {
		segments?: { start: number; end: number; text: string }[];
	};
	return (json.segments ?? []).map((s) => ({
		start: s.start,
		end: s.end,
		text: s.text.trim(),
	}));
}

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9 ]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

for (let i = 0; i < SCRIPT.length; i += 2) {
	const a = SCRIPT[i]!;
	const b = SCRIPT[i + 1];
	if (!b) break;
	if (only && only !== a.id) continue;
	const ma = manifest.find((m) => m.id === a.id)!;
	const mb = manifest.find((m) => m.id === b.id)!;
	const A = readWav(ma.file);
	const B = readWav(mb.file);
	const rate = A.rate;
	const joined = new Int16Array(A.pcm.length + B.pcm.length);
	joined.set(A.pcm, 0);
	joined.set(B.pcm, A.pcm.length);

	const words = await transcribe(to16k(joined, rate));
	const tokens = words
		.map((w, k) => ({ t: norm(w.text), k }))
		.filter((x) => x.t);
	/** First token index where the passage's opening words appear (2 of 3 must match). */
	const find = (text: string, from: number) => {
		const target = norm(text).split(" ").slice(0, 3);
		for (let k = from; k + 2 < tokens.length; k++) {
			const hits = tokens
				.slice(k, k + 3)
				.filter((x, n) => x.t === target[n]).length;
			if (hits >= 2) return k;
		}
		return -1;
	};
	const full = words.map((w) => w.text).join(" ");
	console.log(`
${a.id} + ${b.id}: ${(joined.length / rate).toFixed(1)}s`);
	console.log(`  heard: ${full.slice(0, 200)}…`);
	const ia = find(a.text, 0);
	const ib =
		ia < 0
			? -1
			: find(b.text, ia + Math.floor(norm(a.text).split(" ").length * 0.6));
	if (ia < 0 || ib < 0) {
		console.log("  !! could not locate both passages");
		continue;
	}
	// End of passage one: the last spoken word before passage two, skipping a spoken label.
	let ie = ib - 1;
	const label = new Set(["passage", "two", "2", "to", "too"]);
	while (ie > ia && label.has(tokens[ie]!.t)) ie--;
	const sA = Math.max(0, words[tokens[ia]!.k]!.start - 0.12);
	const eA = words[tokens[ie]!.k]!.end + 0.25;
	const sB = Math.max(eA, words[tokens[ib]!.k]!.start - 0.12);
	const at = (sec: number) =>
		Math.min(joined.length, Math.max(0, Math.round(sec * rate)));
	const clipA = joined.slice(at(sA), at(eA));
	const clipB = joined.slice(at(sB));
	const lenA = clipA.length / rate;
	const lenB = clipB.length / rate;
	console.log(
		`  ${a.id}: ${sA.toFixed(2)}–${eA.toFixed(2)}s (${lenA.toFixed(1)}s) · ${b.id}: from ${sB.toFixed(2)}s (${lenB.toFixed(1)}s)`,
	);
	if (dryRun) continue;
	writeFileSync(join(root, "public", ma.file), wav(clipA, rate));
	writeFileSync(join(root, "public", mb.file), wav(clipB, rate));
	ma.seconds = lenA;
	mb.seconds = lenB;
}
if (!dryRun)
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
