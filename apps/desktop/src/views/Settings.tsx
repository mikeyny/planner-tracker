import {
	type BackupInfo,
	type Settings,
	TIMER_MODE_ORDER,
	TIMER_MODES,
} from "@deep/shared";
import { DatabaseBackup, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Group,
	NumberInput,
	Row,
	Status,
	TextInput,
	TimeInput,
	Toggle,
} from "../components/SettingsParts";
import {
	CalendarGroup,
	CoachRows,
	DistractionsGroup,
} from "../components/SettingsSections";
import { Button, Segmented } from "../components/ui";
import { api } from "../lib/api";
import {
	queryClient,
	useAiStatus,
	useBackups,
	useSettings,
	useUpdateSettings,
} from "../lib/queries";
import { autostart, inTauri } from "../lib/tauri";
import { attempt, toast } from "../lib/ui";

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

			<DistractionsGroup s={s} set={set} />

			<CalendarGroup />

			<Group title="Speech and AI">
				<Row
					label="Speech recognition"
					hint={
						ai?.whisperModel
							? `Whisper · ${ai.whisperModel} · runs on this PC (${ai.whisperBackend === "gpu" ? "graphics card" : "processor"})`
							: undefined
					}
				>
					<Status
						ok={ai?.whisper !== "missing"}
						text={
							ai
								? {
										missing: "Not installed",
										stopped: "Ready, loads when you talk",
										starting: "Loading the model…",
										ready: "Loaded",
									}[ai.whisper]
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
				<CoachRows s={s} set={set} gemini={!!ai?.gemini} />
			</Group>

			<Group title="Projects">
				<Row
					label="Projects folder"
					hint="Find projects looks for repos here (two levels deep). Empty = the folder above this repo."
				>
					<TextInput
						value={s.projectsRoot}
						placeholder="C:\Users\you\dev"
						onChange={(v) => set("projectsRoot", v)}
					/>
				</Row>
			</Group>

			<BackupsGroup
				keep={s.backupsKeep}
				onKeep={(n) => set("backupsKeep", n)}
			/>

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

function BackupsGroup({
	keep,
	onKeep,
}: {
	keep: number;
	onKeep: (n: number) => void;
}) {
	const { data: backups = [] } = useBackups();
	const [busy, setBusy] = useState(false);
	const latest = backups[0];
	const folder = latest
		? latest.path.slice(0, latest.path.length - latest.file.length - 1)
		: "~/.deep/backups";
	const runNow = async () => {
		setBusy(true);
		const b = await attempt(() => api.post<BackupInfo>("/backups"));
		setBusy(false);
		if (b) {
			queryClient.invalidateQueries({ queryKey: ["backups"] });
			toast(`Backed up to ${b.file}`);
		}
	};
	return (
		<Group title="Backups">
			<Row
				label="Daily database backup"
				hint={
					latest
						? `Last: ${new Date(latest.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · ${Math.max(1, Math.round(latest.bytes / 1024))} KB`
						: "None yet. One is made automatically each day while Deep runs."
				}
			>
				<Button size="sm" onClick={runNow} disabled={busy}>
					{busy ? (
						<Loader2 size={13} className="animate-spin" />
					) : (
						<DatabaseBackup size={13} />
					)}{" "}
					Back up now
				</Button>
			</Row>
			<Row label="Keep" hint={folder}>
				<NumberInput value={keep} min={1} suffix="backups" onChange={onKeep} />
			</Row>
		</Group>
	);
}
