import type { CoachMode, CoachServerMessage } from "@deep/shared";
import { API_URL, TOKEN } from "./api";

/**
 * A live voice call with the coach: microphone audio goes to the local API as
 * 16 kHz PCM, the coach's voice comes back as 24 kHz PCM and is played in order.
 */

const IN_RATE = 16_000;
const OUT_RATE = 24_000;

// Collect ~100 ms of 16-bit samples before sending, to keep message counts sane.
const WORKLET = `
class PcmOut extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(1600); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let sum = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      sum += s * s;
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage({ pcm: this.buf.buffer.slice(0) });
        this.n = 0;
      }
    }
    this.port.postMessage({ level: Math.sqrt(sum / ch.length) });
    return true;
  }
}
registerProcessor("pcm-out", PcmOut);
`;

export interface CoachHandlers {
	onMessage: (m: CoachServerMessage) => void;
	/** The socket closed (after "ended", or because the API went away). */
	onClose: () => void;
}

export class CoachCall {
	private ws: WebSocket | null = null;
	private stream: MediaStream | null = null;
	private inCtx: AudioContext | null = null;
	private outCtx: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private playHead = 0;
	private sources = new Set<AudioBufferSourceNode>();
	private muted = false;
	private closed = false;
	micLevel = 0;

	constructor(
		private mode: CoachMode,
		private handlers: CoachHandlers,
	) {}

	async start() {
		this.outCtx = new AudioContext({ sampleRate: OUT_RATE });
		this.analyser = this.outCtx.createAnalyser();
		this.analyser.fftSize = 512;
		this.analyser.connect(this.outCtx.destination);

		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				// Keeps the coach's own voice out of the microphone.
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});
		this.inCtx = new AudioContext({ sampleRate: IN_RATE });
		const url = URL.createObjectURL(
			new Blob([WORKLET], { type: "application/javascript" }),
		);
		await this.inCtx.audioWorklet.addModule(url);
		URL.revokeObjectURL(url);
		const node = new AudioWorkletNode(this.inCtx, "pcm-out");
		node.port.onmessage = (
			e: MessageEvent<{ pcm?: ArrayBuffer; level?: number }>,
		) => {
			if (e.data.level !== undefined) this.micLevel = e.data.level;
			if (e.data.pcm && !this.muted && this.ws?.readyState === WebSocket.OPEN)
				this.ws.send(e.data.pcm);
		};
		this.inCtx.createMediaStreamSource(this.stream).connect(node);

		const ws = new WebSocket(
			`${API_URL.replace(/^http/, "ws")}/coach?mode=${this.mode}&token=${encodeURIComponent(TOKEN)}`,
		);
		ws.binaryType = "arraybuffer";
		this.ws = ws;
		ws.onmessage = (e) => {
			if (typeof e.data === "string") {
				const m = JSON.parse(e.data) as CoachServerMessage;
				if (m.type === "interrupted") this.stopPlayback();
				this.handlers.onMessage(m);
			} else this.play(e.data as ArrayBuffer);
		};
		ws.onclose = () => {
			this.releaseMic();
			this.handlers.onClose();
		};
	}

	private play(buf: ArrayBuffer) {
		const ctx = this.outCtx;
		if (!ctx || !this.analyser) return;
		const pcm = new Int16Array(buf);
		const audio = ctx.createBuffer(1, pcm.length, OUT_RATE);
		const ch = audio.getChannelData(0);
		for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i]! / 0x8000;
		const src = ctx.createBufferSource();
		src.buffer = audio;
		src.connect(this.analyser);
		const at = Math.max(ctx.currentTime + 0.05, this.playHead);
		src.start(at);
		this.playHead = at + audio.duration;
		this.sources.add(src);
		src.onended = () => this.sources.delete(src);
	}

	/** You started talking over the coach: drop what's queued. */
	private stopPlayback() {
		for (const s of this.sources) {
			try {
				s.stop();
			} catch {
				// already stopped
			}
		}
		this.sources.clear();
		this.playHead = 0;
	}

	/** Seconds of coach audio still queued. */
	pendingAudioSec() {
		return this.outCtx
			? Math.max(0, this.playHead - this.outCtx.currentTime)
			: 0;
	}

	/** 0..1 loudness of the coach's voice right now. */
	coachLevel() {
		if (!this.analyser) return 0;
		const data = new Uint8Array(this.analyser.fftSize);
		this.analyser.getByteTimeDomainData(data);
		let sum = 0;
		for (const v of data) sum += ((v - 128) / 128) ** 2;
		return Math.sqrt(sum / data.length);
	}

	setMuted(m: boolean) {
		this.muted = m;
	}

	sendText(text: string) {
		if (this.ws?.readyState === WebSocket.OPEN)
			this.ws.send(JSON.stringify({ type: "text", text }));
	}

	private releaseMic() {
		for (const t of this.stream?.getTracks() ?? []) t.stop();
		this.stream = null;
		this.inCtx?.close().catch(() => {});
		this.inCtx = null;
	}

	/** Hang up now (stops the coach mid-sentence). */
	close() {
		if (this.closed) return;
		this.closed = true;
		if (this.ws?.readyState === WebSocket.OPEN)
			this.ws.send(JSON.stringify({ type: "hangup" }));
		this.ws?.close();
		this.releaseMic();
		this.stopPlayback();
		this.outCtx?.close().catch(() => {});
		this.outCtx = null;
	}
}
