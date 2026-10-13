/**
 * Microphone capture at 16 kHz mono (what Whisper wants), cut into chunks at natural pauses
 * so transcription runs while you're still talking.
 */

const SAMPLE_RATE = 16_000;

/**
 * Chunk lengths. minSec: start looking for a pause to cut at. maxSec: cut regardless
 * (Whisper's window is 30 s). On the GPU a chunk transcribes in ~0.3 s, so short
 * chunks make words appear while you talk; on the CPU each one costs ~7 s.
 */
export const CHUNKING = {
	fast: { minSec: 5, maxSec: 12 },
	slow: { minSec: 18, maxSec: 27 },
} as const;
export type Chunking = { minSec: number; maxSec: number };
/** This much trailing quiet counts as a pause. */
const PAUSE_SEC = 0.5;
const SILENCE_RMS = 0.012;

const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

export interface RecorderHandlers {
	/** A finished chunk of audio, ready to transcribe. */
	onChunk: (wav: Blob, index: number) => void;
	/** Input level 0..1, about 20 times a second. */
	onLevel?: (level: number) => void;
	chunking?: Chunking;
}

export class Recorder {
	private ctx: AudioContext | null = null;
	private stream: MediaStream | null = null;
	private node: AudioWorkletNode | null = null;
	private buffers: Float32Array[] = [];
	private samples = 0;
	private quietSamples = 0;
	private chunkIndex = 0;
	private levelAcc = 0;
	private levelCount = 0;
	elapsedSec = 0;

	constructor(private handlers: RecorderHandlers) {}

	async start() {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});
		this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
		const url = URL.createObjectURL(
			new Blob([WORKLET], { type: "application/javascript" }),
		);
		await this.ctx.audioWorklet.addModule(url);
		URL.revokeObjectURL(url);
		const source = this.ctx.createMediaStreamSource(this.stream);
		this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
		this.node.port.onmessage = (e: MessageEvent<Float32Array>) =>
			this.push(e.data);
		source.connect(this.node);
	}

	private push(frame: Float32Array) {
		this.buffers.push(frame);
		this.samples += frame.length;
		this.elapsedSec += frame.length / SAMPLE_RATE;

		let sum = 0;
		for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
		const rms = Math.sqrt(sum / frame.length);
		this.quietSamples =
			rms < SILENCE_RMS ? this.quietSamples + frame.length : 0;

		this.levelAcc += rms;
		this.levelCount++;
		if (this.levelCount >= 6) {
			this.handlers.onLevel?.(
				Math.min(1, (this.levelAcc / this.levelCount) * 9),
			);
			this.levelAcc = 0;
			this.levelCount = 0;
		}

		const { minSec, maxSec } = this.handlers.chunking ?? CHUNKING.slow;
		const sec = this.samples / SAMPLE_RATE;
		const atPause =
			sec >= minSec && this.quietSamples >= PAUSE_SEC * SAMPLE_RATE;
		if (atPause || sec >= maxSec) this.flush();
	}

	private flush() {
		if (this.samples < SAMPLE_RATE * 0.6) {
			this.reset();
			return;
		}
		const pcm = new Float32Array(this.samples);
		let off = 0;
		for (const b of this.buffers) {
			pcm.set(b, off);
			off += b.length;
		}
		this.reset();
		// Skip chunks that are basically silence (Whisper hallucinates on those).
		let peak = 0;
		for (let i = 0; i < pcm.length; i++)
			peak = Math.max(peak, Math.abs(pcm[i]!));
		if (peak < SILENCE_RMS * 2) return;
		this.handlers.onChunk(encodeWav(pcm), this.chunkIndex++);
	}

	private reset() {
		this.buffers = [];
		this.samples = 0;
		this.quietSamples = 0;
	}

	async stop() {
		this.flush();
		this.node?.disconnect();
		for (const t of this.stream?.getTracks() ?? []) t.stop();
		await this.ctx?.close();
		this.ctx = null;
	}
}

function encodeWav(pcm: Float32Array): Blob {
	const buffer = new ArrayBuffer(44 + pcm.length * 2);
	const v = new DataView(buffer);
	const str = (o: number, s: string) => {
		for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
	};
	str(0, "RIFF");
	v.setUint32(4, 36 + pcm.length * 2, true);
	str(8, "WAVE");
	str(12, "fmt ");
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true);
	v.setUint16(22, 1, true);
	v.setUint32(24, SAMPLE_RATE, true);
	v.setUint32(28, SAMPLE_RATE * 2, true);
	v.setUint16(32, 2, true);
	v.setUint16(34, 16, true);
	str(36, "data");
	v.setUint32(40, pcm.length * 2, true);
	for (let i = 0; i < pcm.length; i++) {
		const s = Math.max(-1, Math.min(1, pcm[i]!));
		v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
	}
	return new Blob([buffer], { type: "audio/wav" });
}
