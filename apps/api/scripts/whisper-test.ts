/**
 * Transcribe a WAV with the local Whisper setup and print timings.
 * Usage: bun run whisper:test [path/to/16khz-mono.wav]
 */
import { resolve } from "node:path";
import {
	stopWhisper,
	transcribe,
	whisperModelName,
	whisperStatus,
} from "../src/lib/whisper";

const file = resolve(
	import.meta.dir,
	"../../..",
	process.argv[2] ?? "tools/whisper/sample.wav",
);
console.log(
	`model: ${whisperModelName() ?? "missing"} · status: ${whisperStatus()}`,
);

const wav = Bun.file(file);
if (!(await wav.exists())) {
	console.error(`No audio at ${file}`);
	process.exit(1);
}

let t = Date.now();
const text = await transcribe(wav, {
	prompt: "Projects: SMP, Cloudlyte, Agri-ledger.",
});
console.log(`cold (includes model load): ${Date.now() - t} ms`);
console.log(`> ${text}`);

t = Date.now();
await transcribe(wav);
console.log(`warm: ${Date.now() - t} ms`);

stopWhisper();
process.exit(0);
