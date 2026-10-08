import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAiStatus } from "../lib/queries";
import { Recorder } from "../lib/recorder";
import { toast } from "../lib/ui";
import { cx } from "./ui";

const METER_BARS = 64;

/**
 * Talk, and the words appear as you go. Audio is transcribed locally by Whisper
 * in ~20 s chunks while you keep talking.
 */
export function VoiceDump({
	value,
	onChange,
}: {
	value: string;
	onChange: (v: string) => void;
}) {
	const { data: ai } = useAiStatus();
	const [recording, setRecording] = useState(false);
	const [pending, setPending] = useState(0);
	const [levels, setLevels] = useState<number[]>(() =>
		Array(METER_BARS).fill(0),
	);
	const [elapsed, setElapsed] = useState(0);
	const recorder = useRef<Recorder | null>(null);
	const chunks = useRef<Map<number, string>>(new Map());
	const base = useRef("");
	const valueRef = useRef(value);
	valueRef.current = value;

	useEffect(() => {
		// Load the model while you gather your thoughts.
		api.post("/ai/warmup").catch(() => {});
	}, []);

	useEffect(() => {
		if (!recording) return;
		const t = setInterval(
			() => setElapsed(recorder.current?.elapsedSec ?? 0),
			250,
		);
		return () => clearInterval(t);
	}, [recording]);

	const render = () => {
		const ordered = [...chunks.current.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([, t]) => t);
		onChange([base.current, ...ordered].filter(Boolean).join(" ").trim());
	};

	const start = async () => {
		chunks.current = new Map();
		base.current = valueRef.current;
		const rec = new Recorder({
			onLevel: (l) => setLevels((prev) => [...prev.slice(1), l]),
			onChunk: async (wav, index) => {
				setPending((p) => p + 1);
				try {
					const form = new FormData();
					form.append("file", wav, `chunk-${index}.wav`);
					const prior = [...chunks.current.entries()]
						.filter(([i]) => i < index)
						.sort((a, b) => a[0] - b[0])
						.map(([, t]) => t)
						.join(" ");
					form.append("context", prior);
					const res = await api.upload<{ text: string }>(
						"/ai/transcribe",
						form,
					);
					chunks.current.set(index, res.text);
					render();
				} catch (err) {
					toast(
						err instanceof Error ? err.message : "Transcription failed",
						"error",
					);
				} finally {
					setPending((p) => p - 1);
				}
			},
		});
		try {
			await rec.start();
			recorder.current = rec;
			setElapsed(0);
			setRecording(true);
		} catch {
			toast(
				"Microphone isn't available. Check Windows privacy settings for microphone access.",
				"error",
			);
		}
	};

	const stop = async () => {
		setRecording(false);
		await recorder.current?.stop();
		recorder.current = null;
		setLevels(Array(METER_BARS).fill(0));
	};

	useEffect(() => () => void recorder.current?.stop(), []);

	const whisperMissing = ai?.whisper === "missing";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-4 rounded-[16px] border border-line bg-surface p-4">
				<button
					type="button"
					disabled={whisperMissing}
					onClick={recording ? stop : start}
					aria-label={recording ? "Stop recording" : "Start recording"}
					className={cx(
						"grid size-14 shrink-0 place-items-center rounded-full transition-transform cursor-pointer disabled:opacity-40",
						recording
							? "bg-rose scale-105 shadow-[0_0_0_8px_rgba(226,69,111,0.18)]"
							: "bg-rose hover:scale-105",
					)}
				>
					{recording ? (
						<Square size={18} className="fill-white text-white" />
					) : (
						<Mic size={22} className="text-white" />
					)}
				</button>
				<div
					className="flex h-10 flex-1 items-center justify-between overflow-hidden"
					aria-hidden
				>
					{levels.map((l, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length level meter, bars never reorder
							key={i}
							className="w-[3px] rounded-full bg-fg transition-[height] duration-100"
							style={{
								height: `${Math.max(3, l * 40)}px`,
								opacity: recording ? 0.85 : 0.25,
							}}
						/>
					))}
				</div>
				<div className="flex w-36 flex-col items-end gap-0.5 text-right">
					<span className="font-mono text-[13px] tabular">
						{Math.floor(elapsed / 60)}:
						{String(Math.floor(elapsed % 60)).padStart(2, "0")}
					</span>
					<span className="flex items-center gap-1 text-[11px] text-muted">
						{pending > 0 ? (
							<>
								<Loader2 size={11} className="animate-spin" /> transcribing
								locally
							</>
						) : whisperMissing ? (
							"Whisper not installed"
						) : ai?.whisper === "starting" ? (
							"loading speech model…"
						) : recording ? (
							"listening"
						) : (
							"press to talk"
						)}
					</span>
				</div>
			</div>
			<textarea
				spellCheck={false}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={7}
				placeholder="…or type. Everything on your mind: what needs doing, what you're avoiding, deadlines, meetings."
				className="w-full rounded-[14px] border border-line bg-bg px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-faint focus:border-line-strong"
			/>
		</div>
	);
}
