import { formatMinutes, suggestedBreakMin, TIMER_MODES } from "@deep/shared";
import {
	ChevronDown,
	Coffee,
	Flag,
	Pause,
	PictureInPicture2,
	Play,
	Plus,
	Square,
	Volume2,
	VolumeX,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Disc } from "../components/Disc";
import { lastFocusTarget } from "../components/SessionDialogs";
import {
	Button,
	cx,
	IconButton,
	Kbd,
	ProjectChip,
	Segmented,
} from "../components/ui";
import { NO_PROJECT_COLOR, useTimer } from "../lib/hooks";
import {
	capture,
	session,
	useCaptures,
	useProjects,
	useSettings,
	useUpdateSettings,
} from "../lib/queries";
import { desktop } from "../lib/tauri";
import { attempt, isTyping, setUi, toast } from "../lib/ui";

const BREAK_IDEAS = [
	"Stand up and stretch your back and shoulders.",
	"Refill your water and drink half of it.",
	"Look at something at least 6 metres away for 20 seconds.",
	"Walk to another room and back.",
	"Close your eyes and take ten slow breaths.",
];

export function FocusView() {
	const {
		session: s,
		elapsed,
		remaining,
		progress,
		paused,
		overtime,
		state,
	} = useTimer();
	const { data: projects = [] } = useProjects();
	const { data: caps = [] } = useCaptures("open");
	const { data: settings } = useSettings();
	const updateSettings = useUpdateSettings();
	const [thought, setThought] = useState("");
	const project = projects.find((p) => p.id === s?.projectId);
	const color =
		s?.kind === "break" ? "#2fb35a" : (s?.project?.color ?? NO_PROJECT_COLOR);
	const idea = useMemo(
		() => BREAK_IDEAS[Math.floor(Math.random() * BREAK_IDEAS.length)],
		[],
	);
	const sessionCaps = caps.filter((c) => c.sessionId === s?.id);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
			if (e.key === "Escape") setUi({ focusOpen: false });
			if (s?.kind !== "focus") return;
			if (e.key.toLowerCase() === "e") {
				e.preventDefault();
				setUi({ endDialog: true });
			}
			if (e.key.toLowerCase() === "u") {
				capture("", "urge").then(() => toast("Urge logged. Back to it."));
			}
			if (e.key.toLowerCase() === "i") {
				capture("", "interruption").then(() => toast("Interruption logged."));
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [s]);

	if (!s) {
		return (
			<div className="grid h-full place-items-center">
				<div className="flex flex-col items-center gap-3 text-center">
					<div className="font-display text-xl font-bold">Nothing running</div>
					<Button tone="primary" onClick={() => setUi({ startDialog: {} })}>
						<Play size={14} className="fill-current" /> Start a session
					</Button>
				</div>
			</div>
		);
	}

	const isBreak = s.kind === "break";
	const shown = remaining ?? elapsed;
	const spec = TIMER_MODES[s.mode];
	const pomodoroDots = s.mode === "pomodoro" ? 4 : 0;
	const done = state?.focusCountToday ?? 0;

	const saveThought = async () => {
		const t = thought.trim();
		if (!t) return;
		setThought("");
		await attempt(() => capture(t));
	};

	return (
		<div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_300px] gap-6">
			<div className="flex min-h-0 flex-col">
				<div className="flex items-center gap-2">
					<Button
						tone="quiet"
						size="sm"
						onClick={() => setUi({ focusOpen: false })}
					>
						<ChevronDown size={14} /> Back to plan <Kbd>Esc</Kbd>
					</Button>
					<div className="ml-auto flex items-center gap-1">
						<SoundPicker
							value={settings?.sound ?? "off"}
							onChange={(sound) => updateSettings.mutate({ sound })}
						/>
						<IconButton
							label="Pop out mini timer"
							onClick={() => desktop.showMini()}
						>
							<PictureInPicture2 size={16} />
						</IconButton>
					</div>
				</div>

				<div className="flex flex-1 flex-col items-center justify-center gap-5 pb-8 text-center">
					<div className="flex flex-wrap justify-center gap-2">
						{isBreak ? (
							<span className="rounded-full bg-raised px-2.5 py-0.5 text-[11.5px] font-semibold text-good">
								Break
							</span>
						) : (
							<>
								<ProjectChip project={s.project} />
								<span className="rounded-full bg-raised px-2.5 py-0.5 text-[11.5px] font-semibold">
									{spec.label} ·{" "}
									{s.plannedSec ? formatMinutes(s.plannedSec / 60) : "open"}
								</span>
								{s.source === "vscode" && (
									<span className="rounded-full bg-raised px-2.5 py-0.5 text-[11.5px] text-muted">
										from VS Code
									</span>
								)}
							</>
						)}
					</div>

					<h1 className="max-w-[34ch] font-display text-[24px] font-bold leading-tight tracking-[-0.01em] text-balance">
						{isBreak
							? "Step away from the screen"
							: (s.task?.title ?? s.project?.name ?? "Focus")}
					</h1>
					{isBreak ? (
						<p className="max-w-[44ch] text-[14px] text-muted">{idea}</p>
					) : s.intention ? (
						<p className="max-w-[44ch] text-[14px] text-muted">
							In this session I will{" "}
							<span className="text-fg">{s.intention}</span>
						</p>
					) : null}

					<Disc
						progress={progress}
						seconds={shown}
						color={color}
						label={remaining === null ? "elapsed" : overtime ? "over" : "left"}
						paused={paused}
						overtime={overtime}
						size={280}
					/>

					{pomodoroDots > 0 && !isBreak && (
						<div className="flex items-center gap-1.5">
							{Array.from({ length: pomodoroDots }).map((_, i) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: four fixed pomodoro slots
									key={i}
									className="h-[5px] w-6 rounded-full"
									style={{
										background:
											i < done % 4
												? color
												: i === done % 4
													? `color-mix(in srgb, ${color} 45%, #2e2c35)`
													: "#2e2c35",
									}}
								/>
							))}
						</div>
					)}

					{overtime && !isBreak ? (
						<TimesUp mode={s.mode} elapsed={elapsed} focusCount={done} />
					) : overtime && isBreak ? (
						<div className="flex flex-col items-center gap-3">
							<div className="text-[14px]">Break's over.</div>
							<BackToWork />
						</div>
					) : (
						<div className="flex flex-wrap justify-center gap-2">
							<Button onClick={() => attempt(session.toggle)}>
								{paused ? (
									<Play size={14} className="fill-current" />
								) : (
									<Pause size={14} />
								)}
								{paused ? "Resume" : "Pause"} <Kbd>Space</Kbd>
							</Button>
							{isBreak ? (
								<BackToWork />
							) : (
								<>
									<Button onClick={() => attempt(() => session.extend(10))}>
										<Plus size={14} /> 10 min
									</Button>
									<Button
										tone="primary"
										onClick={() => setUi({ endDialog: true })}
									>
										<Square size={13} className="fill-current" /> End{" "}
										<Kbd>E</Kbd>
									</Button>
								</>
							)}
						</div>
					)}
				</div>
			</div>

			{!isBreak && (
				<aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-[16px] border border-line bg-surface p-4">
					<div className="flex flex-col gap-2">
						<div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
							Parking lot
						</div>
						<input
							value={thought}
							onChange={(e) => setThought(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && saveThought()}
							placeholder="Capture a thought…"
							className="h-9 rounded-[9px] border border-dashed border-line bg-transparent px-2.5 text-[12.5px] outline-none placeholder:text-faint focus:border-line-strong"
						/>
						<div className="text-[11px] text-faint">
							Write it down so your mind can let go. You'll sort these at your
							break. Anywhere: <Kbd>Ctrl+Shift+Space</Kbd>
						</div>
						{sessionCaps.map((c) => (
							<div key={c.id} className="flex gap-2 text-[12.5px]">
								<span className="mt-px rounded-[5px] bg-raised px-1.5 text-[10px] font-semibold text-muted">
									idea
								</span>
								<span>{c.text}</span>
							</div>
						))}
					</div>

					<div className="flex flex-col gap-2">
						<div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
							Pulled away?
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Button
								size="sm"
								onClick={() =>
									capture("", "urge").then(() =>
										toast("Urge logged. Back to it."),
									)
								}
							>
								<Zap size={13} /> Urge <Kbd>U</Kbd>
							</Button>
							<Button
								size="sm"
								onClick={() =>
									capture("", "interruption").then(() =>
										toast("Interruption logged."),
									)
								}
							>
								<Flag size={13} /> Interrupted <Kbd>I</Kbd>
							</Button>
						</div>
						<div className="text-[11px] text-faint">
							Noticing an urge without acting on it weakens it. The weekly view
							shows your top triggers.
						</div>
					</div>

					{project?.leftOffNote && (
						<div className="flex flex-col gap-1.5">
							<div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
								Where you left off
							</div>
							<div className="text-[12.5px] text-muted">
								"{project.leftOffNote}"
							</div>
						</div>
					)}
				</aside>
			)}
		</div>
	);
}

function TimesUp({
	mode,
	elapsed,
	focusCount,
}: {
	mode: keyof typeof TIMER_MODES;
	elapsed: number;
	focusCount: number;
}) {
	const breakMin = suggestedBreakMin(mode, elapsed, focusCount + 1);
	if (mode === "just5") {
		return (
			<div className="flex flex-col items-center gap-3">
				<div className="text-[14px]">
					Five minutes done. The hardest part is over. Keep going?
				</div>
				<div className="flex gap-2">
					<Button
						tone="primary"
						onClick={() => attempt(() => session.extend(20))}
					>
						Keep going 20 min
					</Button>
					<Button onClick={() => setUi({ endDialog: true })}>Stop here</Button>
				</div>
			</div>
		);
	}
	return (
		<div className="flex flex-col items-center gap-3">
			<div className="text-[14px]">
				Time's up. Finish your sentence, then step away.
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				<Button tone="primary" onClick={() => setUi({ endDialog: true })}>
					<Coffee size={14} /> End and take {breakMin} min
				</Button>
				<Button onClick={() => attempt(() => session.extend(10))}>
					<Plus size={14} /> 10 more min
				</Button>
			</div>
		</div>
	);
}

function BackToWork() {
	return (
		<Button
			tone="primary"
			onClick={async () => {
				await attempt(() => session.stop({}));
				setUi({ startDialog: lastFocusTarget() ?? {}, focusOpen: false });
			}}
		>
			<Play size={14} className="fill-current" /> Back to work
		</Button>
	);
}

function SoundPicker({
	value,
	onChange,
}: {
	value: "off" | "brown" | "pink" | "rain";
	onChange: (v: "off" | "brown" | "pink" | "rain") => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<span className={cx("text-muted", value !== "off" && "text-fg")}>
				{value === "off" ? <VolumeX size={15} /> : <Volume2 size={15} />}
			</span>
			<Segmented
				value={value}
				onChange={onChange}
				options={[
					{ value: "off", label: "Off" },
					{ value: "brown", label: "Brown" },
					{ value: "pink", label: "Pink" },
					{ value: "rain", label: "Rain" },
				]}
			/>
		</div>
	);
}
