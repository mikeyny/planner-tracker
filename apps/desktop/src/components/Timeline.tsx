import {
	hhmmToMin,
	localDate,
	minToHhmm,
	type Project,
	type Task,
	type TimeBlock,
} from "@deep/shared";
import { Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { NO_PROJECT_COLOR, useNow } from "../lib/hooks";
import {
	type DaySession,
	queryClient,
	useCommits,
	useDay,
	useSettings,
} from "../lib/queries";
import { attempt, setUi } from "../lib/ui";
import { cx } from "./ui";

const PPM = 1.15; // pixels per minute
const SNAP = 15;

type Draft = Omit<TimeBlock, "id" | "date">;

const snap = (m: number) => Math.round(m / SNAP) * SNAP;

export function Timeline({
	date,
	tasks,
	projects,
}: {
	date: string;
	tasks: Task[];
	projects: Project[];
}) {
	const { data: day } = useDay(date);
	const { data: settings } = useSettings();
	const now = useNow(30_000);
	const [blocks, setBlocks] = useState<Draft[]>([]);
	const [editing, setEditing] = useState<number | null>(null);
	const [dropAt, setDropAt] = useState<number | null>(null);
	const areaRef = useRef<HTMLDivElement>(null);
	const dragOffset = useRef(0);

	useEffect(() => {
		if (day) setBlocks(day.blocks.map(({ id: _id, date: _d, ...b }) => b));
	}, [day]);

	const startMin =
		Math.floor(
			Math.min(hhmmToMin(settings?.workdayStart ?? "08:30") - 30, 8 * 60) / 60,
		) * 60;
	const endMin =
		Math.ceil((hhmmToMin(settings?.shutdownTime ?? "17:30") + 60) / 60) * 60;
	const height = (endMin - startMin) * PPM;
	const hours = useMemo(() => {
		const out: number[] = [];
		for (let m = startMin; m <= endMin; m += 60) out.push(m);
		return out;
	}, [startMin, endMin]);

	const projectById = useMemo(
		() => new Map(projects.map((p) => [p.id, p])),
		[projects],
	);
	const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

	const save = async (next: Draft[]) => {
		setBlocks(next);
		await attempt(() => api.put(`/day/${date}/blocks`, { blocks: next }));
		queryClient.invalidateQueries({ queryKey: ["capacity", date] });
	};

	const minuteAt = (clientY: number) => {
		const rect = areaRef.current!.getBoundingClientRect();
		return Math.max(
			startMin,
			Math.min(endMin - SNAP, snap(startMin + (clientY - rect.top) / PPM)),
		);
	};

	const onDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDropAt(null);
		const taskId = e.dataTransfer.getData("text/deep-task");
		const blockIdx = e.dataTransfer.getData("text/deep-block");
		if (taskId) {
			const t = taskById.get(Number(taskId));
			if (!t) return;
			const left = Math.max(
				SNAP,
				snap((t.estimateMin ?? 30) - t.spentSec / 60),
			);
			save([
				...blocks,
				{
					taskId: t.id,
					projectId: t.projectId,
					title: t.title,
					startMin: minuteAt(e.clientY),
					durationMin: Math.min(240, left),
					kind: "task",
				},
			]);
		} else if (blockIdx !== "") {
			const i = Number(blockIdx);
			const start = minuteAt(e.clientY - dragOffset.current);
			save(blocks.map((b, j) => (j === i ? { ...b, startMin: start } : b)));
		}
	};

	const startResize = (i: number, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const startY = e.clientY;
		const base = blocks[i]!.durationMin;
		let latest = blocks;
		const move = (ev: MouseEvent) => {
			const d = Math.max(SNAP, snap(base + (ev.clientY - startY) / PPM));
			latest = blocks.map((b, j) => (j === i ? { ...b, durationMin: d } : b));
			setBlocks(latest);
		};
		const up = () => {
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", up);
			save(latest);
		};
		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", up);
	};

	const isToday = date === localDate();
	const nowDate = new Date(now);
	const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();

	return (
		<div className="relative select-none rounded-[14px] border border-line bg-surface py-3 pr-3">
			<div
				ref={areaRef}
				className="relative ml-[46px] mr-[14px]"
				style={{ height }}
				onDragOver={(e) => {
					e.preventDefault();
					setDropAt(
						minuteAt(
							e.clientY -
								(e.dataTransfer.types.includes("text/deep-block")
									? dragOffset.current
									: 0),
						),
					);
				}}
				onDragLeave={() => setDropAt(null)}
				onDrop={onDrop}
				onDoubleClick={(e) => {
					if (e.target !== e.currentTarget) return;
					const next = [
						...blocks,
						{
							taskId: null,
							projectId: null,
							title: "Meeting",
							startMin: minuteAt(e.clientY),
							durationMin: 30,
							kind: "meeting" as const,
						},
					];
					setEditing(next.length - 1);
					save(next);
				}}
			>
				{hours.map((m) => (
					<div
						key={m}
						className="pointer-events-none absolute right-0 left-0 border-t border-[#24222a]"
						style={{ top: (m - startMin) * PPM }}
					>
						<span className="absolute -left-[46px] -top-[7px] w-[38px] text-right font-mono text-[9.5px] text-faint">
							{minToHhmm(m).slice(0, 2)}
						</span>
					</div>
				))}

				{dropAt !== null && (
					<div
						className="pointer-events-none absolute right-0 left-0 h-0.5 rounded bg-fg/60"
						style={{ top: (dropAt - startMin) * PPM }}
					>
						<span className="absolute -top-2 right-1 rounded bg-fg px-1 font-mono text-[9px] text-bg">
							{minToHhmm(dropAt)}
						</span>
					</div>
				)}

				{blocks.map((b, i) => {
					const color =
						b.kind === "meeting"
							? "#55515e"
							: (projectById.get(b.projectId ?? -1)?.color ?? NO_PROJECT_COLOR);
					const task = b.taskId ? taskById.get(b.taskId) : undefined;
					const h = b.durationMin * PPM;
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: blocks are draft rows identified by position; the server replaces them as a set
							key={`${i}-${b.startMin}-${b.title}`}
							draggable={editing !== i}
							onDragStart={(e) => {
								e.dataTransfer.setData("text/deep-block", String(i));
								dragOffset.current =
									e.clientY - e.currentTarget.getBoundingClientRect().top;
							}}
							className={cx(
								"group absolute right-0 left-1 flex flex-col overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-[11.5px] font-semibold",
								task?.status === "done" && "opacity-50",
							)}
							style={{
								top: (b.startMin - startMin) * PPM + 1,
								height: Math.max(18, h - 2),
								borderColor: color,
								background:
									b.kind === "meeting"
										? "repeating-linear-gradient(135deg,#232129 0 6px,#1d1b22 6px 12px)"
										: `color-mix(in srgb, ${color} 22%, var(--color-surface))`,
								zIndex: 2,
							}}
						>
							{editing === i ? (
								<input
									autoFocus
									defaultValue={b.title}
									className="bg-transparent outline-none"
									onBlur={(e) => {
										setEditing(null);
										const title = e.target.value.trim() || "Meeting";
										save(blocks.map((x, j) => (j === i ? { ...x, title } : x)));
									}}
									onKeyDown={(e) =>
										e.key === "Enter" && (e.target as HTMLInputElement).blur()
									}
								/>
							) : (
								<span
									className="truncate"
									onDoubleClick={() => b.kind !== "task" && setEditing(i)}
									title={b.title}
								>
									{b.title}
								</span>
							)}
							{h > 44 && (
								<span className="font-mono text-[10px] font-normal text-muted">
									{minToHhmm(b.startMin)}–
									{minToHhmm(b.startMin + b.durationMin)}
								</span>
							)}
							<div className="absolute top-1 right-1 hidden gap-0.5 group-hover:flex">
								{b.taskId && task?.status !== "done" && (
									<button
										type="button"
										aria-label="Start focus"
										className="grid size-5 place-items-center rounded bg-black/30 text-fg hover:bg-black/50 cursor-pointer"
										onClick={() => setUi({ startDialog: { taskId: b.taskId } })}
									>
										<Play size={10} className="fill-current" />
									</button>
								)}
								<button
									type="button"
									aria-label="Remove block"
									className="grid size-5 place-items-center rounded bg-black/30 text-fg hover:bg-black/50 cursor-pointer"
									onClick={() => save(blocks.filter((_, j) => j !== i))}
								>
									<X size={11} />
								</button>
							</div>
							<div
								className="absolute right-0 bottom-0 left-0 h-1.5 cursor-ns-resize"
								onMouseDown={(e) => startResize(i, e)}
							/>
						</div>
					);
				})}

				{/* What actually happened, as a thin rail on the right. */}
				<ActualRail
					sessions={day?.sessions ?? []}
					startMin={startMin}
					projectById={projectById}
				/>
				<CommitMarks date={date} startMin={startMin} endMin={endMin} />

				{isToday && nowMin >= startMin && nowMin <= endMin && (
					<div
						className="pointer-events-none absolute -left-[46px] right-[-14px] z-10 border-t-2 border-rose"
						style={{ top: (nowMin - startMin) * PPM }}
					>
						<span className="absolute -top-[9px] left-0.5 rounded bg-rose px-1 font-mono text-[9px] text-white">
							{minToHhmm(nowMin)}
						</span>
					</div>
				)}
			</div>
			<div className="mt-2 ml-[46px] text-[11px] text-faint">
				Drag tasks here. Double-click to add a meeting. The right edge shows
				actual focus and ◆ your commits.
			</div>
		</div>
	);
}

/** Your git commits that day, as small dots beside the actual-focus rail. */
function CommitMarks({
	date,
	startMin,
	endMin,
}: {
	date: string;
	startMin: number;
	endMin: number;
}) {
	const { data: commits = [] } = useCommits(date);
	return (
		<>
			{commits.map((c) => {
				const d = new Date(c.at);
				const m = d.getHours() * 60 + d.getMinutes();
				if (m < startMin || m > endMin) return null;
				return (
					<div
						key={c.hash}
						title={`${minToHhmm(m)} · ${c.hash} · ${c.subject}`}
						className="absolute -right-[23px] z-[3] size-[7px] -translate-y-1/2 rotate-45 rounded-[1px] border border-bg"
						style={{ top: (m - startMin) * PPM, background: c.color }}
					/>
				);
			})}
		</>
	);
}

function ActualRail({
	sessions,
	startMin,
	projectById,
}: {
	sessions: DaySession[];
	startMin: number;
	projectById: Map<number, Project>;
}) {
	useNow(30_000);
	return (
		<div
			className="pointer-events-none absolute top-0 -right-[11px] bottom-0 w-[6px]"
			title="Actual focus"
		>
			{sessions
				.filter((s) => s.kind === "focus")
				.map((s) => {
					const st = new Date(s.startedAt);
					const en = s.endedAt ? new Date(s.endedAt) : new Date();
					const a = st.getHours() * 60 + st.getMinutes();
					const b = en.getHours() * 60 + en.getMinutes();
					return (
						<div
							key={s.id}
							className="absolute right-0 left-0 rounded-sm"
							style={{
								top: (a - startMin) * PPM,
								height: Math.max(3, (b - a) * PPM),
								background:
									projectById.get(s.projectId ?? -1)?.color ?? NO_PROJECT_COLOR,
							}}
						/>
					);
				})}
		</div>
	);
}
