import { formatClock } from "@deep/shared";
import { emitTo } from "@tauri-apps/api/event";
import { Maximize2, Pause, Play, Square, X } from "lucide-react";
import { NO_PROJECT_COLOR, useTimer } from "../lib/hooks";
import { session } from "../lib/queries";
import { desktop } from "../lib/tauri";
import { attempt } from "../lib/ui";

/** The always-on-top timer that sits over VS Code. */
export function MiniTimer() {
	const {
		session: s,
		remaining,
		elapsed,
		paused,
		progress,
		overtime,
	} = useTimer();
	const color =
		s?.kind === "break" ? "#2fb35a" : (s?.project?.color ?? NO_PROJECT_COLOR);

	const openMain = async (event: "open-focus" | "open-end" | "open-start") => {
		await desktop.showMain();
		await emitTo("main", event);
	};

	return (
		<div
			data-tauri-drag-region
			className="relative flex h-full items-center gap-3 overflow-hidden border border-line bg-surface px-3"
		>
			{progress !== null && (
				<div
					className="pointer-events-none absolute bottom-0 left-0 h-[3px]"
					style={{ width: `${progress * 100}%`, background: color }}
				/>
			)}
			{s ? (
				<>
					<div
						data-tauri-drag-region
						className="relative size-10 shrink-0 rounded-full"
						style={{
							background: `conic-gradient(${color} ${progress ?? 1}turn, #2a2830 0)`,
						}}
					>
						<div
							data-tauri-drag-region
							className="absolute inset-[5px] rounded-full bg-surface"
						/>
					</div>
					<div data-tauri-drag-region className="min-w-0 flex-1">
						<div
							data-tauri-drag-region
							className="truncate text-[11.5px] font-semibold text-muted"
						>
							{s.kind === "break"
								? "Break"
								: (s.task?.title ?? s.project?.name ?? "Focus")}
						</div>
						<div
							data-tauri-drag-region
							className={`font-mono text-[22px] leading-tight tabular ${overtime ? "text-warn" : paused ? "text-muted" : ""}`}
						>
							{formatClock(remaining ?? elapsed)}
						</div>
					</div>
					<div className="flex items-center gap-0.5">
						<MiniButton
							label={paused ? "Resume" : "Pause"}
							onClick={() => attempt(session.toggle)}
						>
							{paused ? (
								<Play size={14} className="fill-current" />
							) : (
								<Pause size={14} />
							)}
						</MiniButton>
						{s.kind === "focus" && (
							<MiniButton
								label="End session"
								onClick={() => openMain("open-end")}
							>
								<Square size={12} className="fill-current" />
							</MiniButton>
						)}
						<MiniButton
							label="Open Deep"
							onClick={() => openMain("open-focus")}
						>
							<Maximize2 size={13} />
						</MiniButton>
					</div>
				</>
			) : (
				<>
					<div
						data-tauri-drag-region
						className="flex-1 text-[12.5px] text-muted"
					>
						No session running
					</div>
					<MiniButton label="Start" onClick={() => openMain("open-start")}>
						<Play size={14} className="fill-current" />
					</MiniButton>
				</>
			)}
			<MiniButton label="Hide" onClick={() => desktop.hideSelf()}>
				<X size={13} />
			</MiniButton>
		</div>
	);
}

function MiniButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={onClick}
			className="grid size-7 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg cursor-pointer"
		>
			{children}
		</button>
	);
}
