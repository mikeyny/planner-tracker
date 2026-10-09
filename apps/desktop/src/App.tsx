import { formatClock } from "@deep/shared";
import {
	BarChart3,
	CalendarCheck,
	FolderKanban,
	Inbox,
	Pause,
	Play,
	Search,
	Settings as SettingsIcon,
	Sunrise,
} from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { CommandPalette } from "./components/CommandPalette";
import {
	BreakOffer,
	EndSessionDialog,
	IdleReturnDialog,
	StartSessionDialog,
} from "./components/SessionDialogs";
import { SessionEffects } from "./components/SessionEffects";
import { cx, Kbd } from "./components/ui";
import { NO_PROJECT_COLOR, useTimer } from "./lib/hooks";
import { useConnected, useLiveState } from "./lib/live";
import { session, useTasks, useToday } from "./lib/queries";
import { attempt, getUi, isTyping, setUi, useUi, type View } from "./lib/ui";
import { FocusView } from "./views/Focus";
import { InboxView } from "./views/Inbox";
import { ProjectsView } from "./views/Projects";
import { SettingsView } from "./views/Settings";
import { ShutdownView } from "./views/Shutdown";
import { StartDayView } from "./views/StartDay";
import { StatsView } from "./views/Stats";
import { TodayView } from "./views/Today";

const NAV: { v: View; label: string; icon: ReactNode; key: string }[] = [
	{ v: "today", label: "Today", icon: <CalendarCheck size={17} />, key: "1" },
	{ v: "inbox", label: "Inbox", icon: <Inbox size={17} />, key: "2" },
	{
		v: "projects",
		label: "Projects",
		icon: <FolderKanban size={17} />,
		key: "3",
	},
	{ v: "stats", label: "Stats", icon: <BarChart3 size={17} />, key: "4" },
	{
		v: "settings",
		label: "Settings",
		icon: <SettingsIcon size={17} />,
		key: "5",
	},
];

export function App() {
	const view = useUi((s) => s.view);
	const focusOpen = useUi((s) => s.focusOpen);
	const toast = useUi((s) => s.toast);
	const connected = useConnected();
	// Live state, not useTimer: the timer ticks every second and would re-render every screen.
	const s = useLiveState()?.session ?? null;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const ui = getUi();
			const modalOpen = !!(
				ui.startDialog ||
				ui.endDialog ||
				ui.palette ||
				ui.breakOffer !== null
			);
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setUi({ palette: !ui.palette });
				return;
			}
			if (e.ctrlKey && /^[1-5]$/.test(e.key)) {
				e.preventDefault();
				setUi({ view: NAV[Number(e.key) - 1]!.v, focusOpen: false });
				return;
			}
			if (isTyping(e) || modalOpen || e.ctrlKey || e.metaKey || e.altKey)
				return;
			if (e.key === " ") {
				if (getUi().focusOpen || s) {
					e.preventDefault();
					attempt(session.toggle);
				}
			} else if (e.key.toLowerCase() === "n" && !ui.focusOpen) {
				e.preventDefault();
				if (ui.view !== "today" && ui.view !== "inbox")
					setUi({ view: "today" });
				setUi({ composerFocus: ui.composerFocus + 1 });
			} else if (e.key.toLowerCase() === "f" && s) {
				setUi({ focusOpen: !ui.focusOpen });
			} else if (e.key.toLowerCase() === "s" && !s && !ui.focusOpen) {
				// preventDefault so the "s" doesn't land in the dialog's focused input.
				e.preventDefault();
				setUi({ startDialog: {} });
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [s]);

	const showFocus = focusOpen && !!s;

	return (
		<div className="flex h-full">
			<Sidebar view={view} />
			<main className="relative min-w-0 flex-1 px-7 pt-6">
				{!connected && (
					<div className="absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-line bg-raised px-3 py-1 text-[12px] text-muted">
						Connecting to the local API…
					</div>
				)}
				<div className={cx("h-full", showFocus && "hidden")}>
					{view === "today" && <TodayView />}
					{view === "inbox" && <InboxView />}
					{view === "projects" && <ProjectsView />}
					{view === "stats" && <StatsView />}
					{view === "settings" && <SettingsView />}
					{view === "startday" && <StartDayView />}
					{view === "shutdown" && <ShutdownView />}
				</div>
				{showFocus && (
					<div className="h-full pb-6">
						<FocusView />
					</div>
				)}
			</main>

			<StartSessionDialog />
			<EndSessionDialog />
			<BreakOffer />
			<IdleReturnDialog />
			<CommandPalette />
			<SessionEffects />

			{toast && (
				<div
					key={toast.id}
					className={cx(
						"animate-pop fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-[13px] shadow-xl",
						toast.tone === "error"
							? "border-[#5c2a2a] bg-[#2a1517] text-[#f6b3b3]"
							: "border-line bg-raised text-fg",
					)}
				>
					{toast.text}
				</div>
			)}
		</div>
	);
}

function Sidebar({ view }: { view: View }) {
	const today = useToday();
	const { data: inbox = [] } = useTasks("inbox");
	return (
		<aside className="flex w-[220px] shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 pt-5 pb-4">
			<div className="mb-4 flex items-center gap-2.5 px-2">
				<div
					className="size-6 rounded-full"
					style={{
						background: "conic-gradient(#3987e5 0.62turn, #26232c 0)",
						boxShadow: "inset 0 0 0 5px #17161c",
					}}
				/>
				<span className="font-display text-[18px] font-extrabold tracking-[-0.02em]">
					Deep
				</span>
			</div>

			<button
				type="button"
				onClick={() => setUi({ palette: true })}
				className="mb-2 flex h-9 items-center gap-2 rounded-[10px] border border-line bg-bg px-2.5 text-[12.5px] text-faint hover:text-muted cursor-pointer"
			>
				<Search size={14} /> <span className="whitespace-nowrap">Search…</span>
				<span className="ml-auto">
					<Kbd>Ctrl K</Kbd>
				</span>
			</button>

			{NAV.map((n) => (
				<button
					key={n.v}
					type="button"
					onClick={() => setUi({ view: n.v, focusOpen: false })}
					className={cx(
						"flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-colors cursor-pointer",
						view === n.v
							? "bg-raised text-fg"
							: "text-muted hover:bg-raised/60 hover:text-fg",
					)}
				>
					{n.icon}
					{n.label}
					{n.v === "inbox" && inbox.length > 0 && (
						<span className="ml-auto font-mono text-[11px] text-faint">
							{inbox.length}
						</span>
					)}
				</button>
			))}

			<button
				type="button"
				onClick={() => setUi({ view: "startday", focusOpen: false })}
				className="mt-3 flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] font-medium text-muted hover:bg-raised/60 hover:text-fg cursor-pointer"
			>
				<Sunrise size={17} /> Start my day
			</button>

			<div className="mt-auto">
				<LiveCard key={today} />
			</div>
		</aside>
	);
}

function LiveCard() {
	const { session: s, remaining, elapsed, paused, progress } = useTimer();
	if (!s) {
		return (
			<button
				type="button"
				onClick={() => setUi({ startDialog: {} })}
				className="flex w-full items-center gap-3 rounded-[12px] border border-dashed border-line px-3 py-3 text-left text-[12.5px] text-muted hover:border-line-strong hover:text-fg cursor-pointer"
			>
				<Play size={15} className="fill-current" /> Start focus{" "}
				<span className="ml-auto">
					<Kbd>S</Kbd>
				</span>
			</button>
		);
	}
	const color =
		s.kind === "break" ? "#2fb35a" : (s.project?.color ?? NO_PROJECT_COLOR);
	return (
		<div
			className="flex cursor-pointer flex-col gap-2 rounded-[12px] border border-line bg-bg p-3"
			onClick={() => setUi({ focusOpen: true })}
		>
			<div className="flex items-center gap-2 text-[11.5px] font-semibold text-muted">
				<span className="size-2 rounded-full" style={{ background: color }} />
				<span className="truncate">
					{s.kind === "break" ? "Break" : (s.project?.name ?? "Focus")}
				</span>
			</div>
			<div className="truncate text-[12.5px] font-semibold">
				{s.task?.title ?? s.intention ?? ""}
			</div>
			<div className="flex items-center justify-between">
				<span
					className={cx(
						"font-mono text-[20px] tabular",
						paused && "text-muted",
					)}
				>
					{formatClock(remaining ?? elapsed)}
				</span>
				<button
					type="button"
					aria-label={paused ? "Resume" : "Pause"}
					onClick={(e) => {
						e.stopPropagation();
						attempt(session.toggle);
					}}
					className="grid size-8 place-items-center rounded-full bg-raised hover:bg-hover cursor-pointer"
				>
					{paused ? (
						<Play size={13} className="fill-current" />
					) : (
						<Pause size={13} />
					)}
				</button>
			</div>
			{progress !== null && (
				<div className="h-1 overflow-hidden rounded-full bg-[#2a2830]">
					<div
						className="h-full"
						style={{ width: `${progress * 100}%`, background: color }}
					/>
				</div>
			)}
		</div>
	);
}
