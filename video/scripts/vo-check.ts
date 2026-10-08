/** Transcribe each narration clip with local Whisper and compare it with the script. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCRIPT } from "../src/script";

const root = join(import.meta.dir, "..");
const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9 ]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.split(" ");

for (const { id, text } of SCRIPT) {
	const buf = readFileSync(join(root, "public", "vo", `${id}.wav`));
	const rate = buf.readUInt32LE(24);
	const pcm = new Int16Array(
		buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + buf.length),
	);
	const ratio = rate / 16000;
	const out = new Int16Array(Math.floor(pcm.length / ratio));
	for (let i = 0; i < out.length; i++) out[i] = pcm[Math.floor(i * ratio)]!;
	const h = Buffer.alloc(44);
	h.write("RIFF", 0);
	h.writeUInt32LE(36 + out.byteLength, 4);
	h.write("WAVEfmt ", 8);
	h.writeUInt32LE(16, 16);
	h.writeUInt16LE(1, 20);
	h.writeUInt16LE(1, 22);
	h.writeUInt32LE(16000, 24);
	h.writeUInt32LE(32000, 28);
	h.writeUInt16LE(2, 32);
	h.writeUInt16LE(16, 34);
	h.write("data", 36);
	h.writeUInt32LE(out.byteLength, 40);
	const form = new FormData();
	form.append(
		"file",
		new Blob([h, Buffer.from(out.buffer)], { type: "audio/wav" }),
		"c.wav",
	);
	form.append("response_format", "json");
	form.append("language", "en");
	const res = await fetch("http://127.0.0.1:4041/inference", {
		method: "POST",
		body: form,
	});
	const heard = ((await res.json()) as { text: string }).text;
	const want = norm(text);
	const got = new Set(norm(heard));
	const recall = want.filter((w) => got.has(w)).length / want.length;
	const extra = norm(heard).filter((w) => !new Set(want).has(w));
	console.log(
		`${recall >= 0.85 ? "ok " : "!! "} ${id.padEnd(9)} ${(recall * 100).toFixed(0)}%  extra: ${extra.slice(0, 8).join(" ")}`,
	);
	if (recall < 0.85) console.log(`     heard: ${heard.trim()}`);
}
