/** Ambient noise and chimes, synthesised with Web Audio so they work offline. */

export type Ambient = "off" | "brown" | "pink" | "rain";

let ctx: AudioContext | null = null;
let ambientNodes: {
	src: AudioBufferSourceNode;
	gain: GainNode;
	extra?: AudioNode[];
} | null = null;
let currentAmbient: Ambient = "off";

function audio() {
	ctx ??= new AudioContext();
	if (ctx.state === "suspended") void ctx.resume();
	return ctx;
}

function noiseBuffer(kind: "brown" | "pink" | "white", seconds = 6) {
	const ac = audio();
	const len = ac.sampleRate * seconds;
	const buf = ac.createBuffer(2, len, ac.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const d = buf.getChannelData(ch);
		let last = 0;
		let b0 = 0;
		let b1 = 0;
		let b2 = 0;
		let b3 = 0;
		let b4 = 0;
		let b5 = 0;
		let b6 = 0;
		for (let i = 0; i < len; i++) {
			const w = Math.random() * 2 - 1;
			if (kind === "brown") {
				last = (last + 0.02 * w) / 1.02;
				d[i] = last * 3.5;
			} else if (kind === "pink") {
				b0 = 0.99886 * b0 + w * 0.0555179;
				b1 = 0.99332 * b1 + w * 0.0750759;
				b2 = 0.969 * b2 + w * 0.153852;
				b3 = 0.8665 * b3 + w * 0.3104856;
				b4 = 0.55 * b4 + w * 0.5329522;
				b5 = -0.7616 * b5 - w * 0.016898;
				d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
				b6 = w * 0.115926;
			} else {
				d[i] = w;
			}
		}
	}
	return buf;
}

export function setAmbient(kind: Ambient, volume: number) {
	if (kind === currentAmbient && ambientNodes) {
		ambientNodes.gain.gain.setTargetAtTime(volume, audio().currentTime, 0.3);
		return;
	}
	stopAmbient();
	currentAmbient = kind;
	if (kind === "off") return;
	const ac = audio();
	const src = ac.createBufferSource();
	src.loop = true;
	const gain = ac.createGain();
	gain.gain.value = 0;
	const extra: AudioNode[] = [];
	if (kind === "rain") {
		// Rain: band-passed white noise with a slow wobble.
		src.buffer = noiseBuffer("white");
		const hp = ac.createBiquadFilter();
		hp.type = "highpass";
		hp.frequency.value = 400;
		const lp = ac.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = 5200;
		const lfo = ac.createOscillator();
		lfo.frequency.value = 0.15;
		const lfoGain = ac.createGain();
		lfoGain.gain.value = 900;
		lfo.connect(lfoGain).connect(lp.frequency);
		lfo.start();
		src.connect(hp).connect(lp).connect(gain);
		extra.push(lfo);
		gain.gain.setTargetAtTime(volume * 0.35, ac.currentTime, 1);
	} else {
		src.buffer = noiseBuffer(kind);
		src.connect(gain);
		gain.gain.setTargetAtTime(volume, ac.currentTime, 1);
	}
	gain.connect(ac.destination);
	src.start();
	ambientNodes = { src, gain, extra };
}

export function stopAmbient() {
	if (!ambientNodes || !ctx) {
		currentAmbient = "off";
		return;
	}
	const { src, gain, extra } = ambientNodes;
	gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
	setTimeout(() => {
		src.stop();
		for (const n of extra ?? []) if (n instanceof OscillatorNode) n.stop();
	}, 800);
	ambientNodes = null;
	currentAmbient = "off";
}

/** A soft two-note bell. `kind` picks the interval. */
export function chime(kind: "end" | "break" | "soft" = "end") {
	const ac = audio();
	const notes =
		kind === "end" ? [659.25, 880] : kind === "break" ? [880, 659.25] : [784];
	notes.forEach((freq, i) => {
		const t = ac.currentTime + i * 0.28;
		const osc = ac.createOscillator();
		osc.type = "sine";
		osc.frequency.value = freq;
		const g = ac.createGain();
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(kind === "soft" ? 0.06 : 0.16, t + 0.02);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
		osc.connect(g).connect(ac.destination);
		osc.start(t);
		osc.stop(t + 1.7);
	});
}
