import { type Settings, TIMER_MODE_ORDER, TIMER_MODES } from "@deep/shared";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Segmented } from "../components/ui";
import { useAiStatus, useSettings, useUpdateSettings } from "../lib/queries";
import { autostart, inTauri } from "../lib/tauri";

export function SettingsView() {
	const { data: s } = useSettings();
	const update = useUpdateSettings();
	const { data: ai } = useAiStatus();
	const [launch, setLaunch] = useState<boolean | null>(null);

	useEffect(() => {
		if (inTauri)
			autostart()
				.then(setLaunch)
				.catch(() => setLaunch(null));
	}, []);

	if (!s) return null;
	const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
		update.mutate({ [k]: v });

	return (
		<div className="mx-auto flex h-full min-h-0 max-w-[760px] flex-col gap-6 overflow-y-auto pb-10">
			<h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
				Settings
			</h1>

			<Group title="Your day">
				<Row label="Daily deep-work target" hint="Shown as the ring on Today">
					<NumberInput
						value={s.dailyTargetMin / 60}
						step={0.5}
						min={0.5}
						suffix="h"
						onChange={(v) => set("dailyTargetMin", Math.round(v * 60))}
					/>
				</Row>
				<Row label="Workday starts">
					<TimeInput
						value={s.workdayStart}
						onChange={(v) => set("workdayStart", v)}
					/>
				</Row>
				<Row label="Shutdown time" hint="You get a reminder to close the day">
					<TimeInput
						value={s.shutdownTime}
						onChange={(v) => set("shutdownTime", v)}
					/>
				</Row>
			</Group>

			<Group title="Focus">
				<Row label="Default timer">
					<select
						className="h-8 rounded-lg border border-line bg-bg px-2 text-[13px]"
						value={s.defaultMode}
						onChange={(e) =>
							set("defaultMode", e.target.value as Settings["defaultMode"])
						}
					>
						{TIMER_MODE_ORDER.map((m) => (
							<option key={m} value={m}>
								{TIMER_MODES[m].label} {TIMER_MODES[m].short}
							</option>
						))}
					</select>
				</Row>
				<Row label="Timebox length">
					<NumberInput
						value={s.timeboxMin}
						step={5}
						min={5}
						suffix="min"
						onChange={(v) => set("timeboxMin", v)}
					/>
				</Row>
				<Row label="Show mini timer when a session starts">
					<Toggle
						value={s.autoMiniTimer}
						onChange={(v) => set("autoMiniTimer", v)}
					/>
				</Row>
				<Row
					label="Soft chime every 15 minutes"
					hint="Helps when time seems to disappear"
				>
					<Toggle
						value={s.chimeEvery15}
						onChange={(v) => set("chimeEvery15", v)}
					/>
				</Row>
				<Row label="Desktop notifications">
					<Toggle
						value={s.notifications}
						onChange={(v) => set("notifications", v)}
					/>
				</Row>
				<Row label="Background sound volume">
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={s.soundVolume}
						onChange={(e) => set("soundVolume", Number(e.target.value))}
						className="w-40 accent-[#eceaf0]"
					/>
				</Row>
			</Group>

			<Group title="Automatic tracking">
				<Row label="Pause after no keyboard or mouse input for">
					<NumberInput
						value={s.idlePauseMin}
						min={1}
						suffix="min"
						onChange={(v) => set("idlePauseMin", v)}
					/>
				</Row>
				<Row label="Offer to end the session after">
					<NumberInput
						value={s.idleEndMin}
						min={2}
						suffix="min away"
						onChange={(v) => set("idleEndMin", v)}
					/>
				</Row>
				<Row
					label="Opening a linked folder in VS Code"
					hint="Auto-start only triggers once you start editing"
				>
					<Segmented
						value={s.vscodeStart}
						onChange={(v) => set("vscodeStart", v)}
						options={[
							{ value: "ask", label: "Ask" },
							{ value: "auto", label: "Auto-start" },
							{ value: "off", label: "Off" },
						]}
					/>
				</Row>
				<Row label="Pause when the project's VS Code window closes">
					<Toggle
						value={s.vscodeClosePause}
						onChange={(v) => set("vscodeClosePause", v)}
					/>
				</Row>
				<Row label="Offer to switch when I edit a different project">
					<Toggle
						value={s.vscodeSwitchPrompt}
						onChange={(v) => set("vscodeSwitchPrompt", v)}
					/>
				</Row>
			</Group>

			<Group title="Speech and AI">
				<Row
					label="Speech recognition"
					hint={
						ai?.whisperModel
							? `Whisper · ${ai.whisperModel} · runs on this PC`
							: undefined
					}
				>
					<Status
						ok={ai?.whisper !== "missing"}
						text={
							ai
								? ai.whisper === "missing"
									? "Not installed"
									: ai.whisper
								: "…"
						}
					/>
				</Row>
				<Row label="Speech language">
					<select
						className="h-8 rounded-lg border border-line bg-bg px-2 text-[13px]"
						value={s.speechLanguage}
						onChange={(e) => set("speechLanguage", e.target.value)}
					>
						<option value="en">English</option>
						<option value="auto">Detect automatically</option>
					</select>
				</Row>
				<Row
					label="Gemini"
					hint={
						ai?.gemini
							? ai.model
							: "Set GEMINI_API_KEY in the .env file at the repo root, then restart"
					}
				>
					<Status
						ok={!!ai?.gemini}
						text={ai?.gemini ? "Connected" : "No key"}
					/>
				</Row>
			</Group>

			{inTauri && (
				<Group title="App">
					<Row
						label="Start Deep when Windows starts"
						hint={
							import.meta.env.DEV
								? "Available in the installed build (bun run build:desktop)"
								: undefined
						}
					>
						<Toggle
							value={!!launch}
							onChange={async (v) => {
								if (import.meta.env.DEV) return;
								setLaunch(await autostart(v));
							}}
						/>
					</Row>
				</Group>
			)}
		</div>
	);
}

function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col rounded-[14px] border border-line bg-surface">
			<h2 className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
				{title}
			</h2>
			<div className="flex flex-col divide-y divide-line">{children}</div>
		</section>
	);
}

function Row({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<div>
				<div className="text-[13.5px]">{label}</div>
				{hint && <div className="text-[11.5px] text-muted">{hint}</div>}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

function Toggle({
	value,
	onChange,
}: {
	value: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={value}
			onClick={() => onChange(!value)}
			className={`relative h-6 w-10 rounded-full transition-colors cursor-pointer ${value ? "bg-fg" : "bg-line-strong"}`}
		>
			<span
				className={`absolute top-1 size-4 rounded-full transition-all ${value ? "left-5 bg-bg" : "left-1 bg-muted"}`}
			/>
		</button>
	);
}

function NumberInput({
	value,
	onChange,
	suffix,
	step = 1,
	min = 0,
}: {
	value: number;
	onChange: (v: number) => void;
	suffix?: string;
	step?: number;
	min?: number;
}) {
	const [v, setV] = useState(String(value));
	useEffect(() => setV(String(value)), [value]);
	return (
		<span className="flex items-center gap-2 text-[12px] text-muted">
			<input
				type="number"
				value={v}
				step={step}
				min={min}
				onChange={(e) => setV(e.target.value)}
				onBlur={() => {
					const n = Number(v);
					if (Number.isFinite(n) && n >= min && n !== value) onChange(n);
					else setV(String(value));
				}}
				className="h-8 w-20 rounded-lg border border-line bg-bg px-2 text-right font-mono text-[13px] text-fg"
			/>
			{suffix}
		</span>
	);
}

function TimeInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<input
			type="time"
			value={value}
			onChange={(e) => e.target.value && onChange(e.target.value)}
			className="h-8 rounded-lg border border-line bg-bg px-2 font-mono text-[13px]"
		/>
	);
}

function Status({ ok, text }: { ok: boolean; text: string }) {
	return (
		<span
			className={`flex items-center gap-1.5 text-[12.5px] ${ok ? "text-good" : "text-warn"}`}
		>
			{ok ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
			{text}
		</span>
	);
}
