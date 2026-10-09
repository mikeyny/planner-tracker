import { formatMinutes, hhmmToMin, type Task } from "@deep/shared";
import { Moon, Sunrise } from "lucide-react";
import { useMemo, useState } from "react";
import { CapacityBanner } from "../components/Capacity";
import { SplitDialog } from "../components/SplitDialog";
import { TaskComposer } from "../components/TaskComposer";
import { TaskRow } from "../components/TaskRow";
import { Timeline } from "../components/Timeline";
import { Button, EmptyState, SectionLabel } from "../components/ui";
import { useNow } from "../lib/hooks";
import {
	useDay,
	useDayStats,
	useProjects,
	useReviewPending,
	useSettings,
	useTasks,
	useToday,
} from "../lib/queries";
import { setUi } from "../lib/ui";

export function TodayView() {
	const today = useToday();
	const { data: tasks = [] } = useTasks("today", today);
	const { data: overdue = [] } = useTasks("overdue", today);
	const { data: projects = [] } = useProjects();
	const { data: day } = useDay(today);
	const { data: settings } = useSettings();
	const [splitting, setSplitting] = useState<Task | null>(null);
	const now = useNow(60_000);
	const { data: pending } = useReviewPending();
	// Nudge on Monday–Wednesday only; later in the week it's just a sidebar dot.
	const reviewDue =
		!!pending && !pending.done && [1, 2, 3].includes(new Date(now).getDay());

	const projectById = useMemo(
		() => new Map(projects.map((p) => [p.id, p])),
		[projects],
	);
	const open = tasks.filter((t) => t.status === "open");
	const top3 = open.filter((t) => t.isTop3);
	const rest = open.filter((t) => !t.isTop3);
	const done = tasks.filter((t) => t.status === "done");

	const started = !!day?.plan.startedAt;
	const shutDown = !!day?.plan.shutdownAt;
	const d = new Date(now);
	const pastShutdown =
		settings &&
		d.getHours() * 60 + d.getMinutes() >= hhmmToMin(settings.shutdownTime) - 15;

	const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

	return (
		<div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(320px,400px)] gap-6">
			<div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1 pb-10">
				<header className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<div className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
							{dateLabel}
						</div>
						<h1 className="mt-1 font-display text-[28px] font-extrabold tracking-[-0.02em]">
							{shutDown
								? "Day closed. Rest well."
								: top3.length
									? "Your three big rocks"
									: "What matters today?"}
						</h1>
					</div>
					<div className="flex gap-2">
						{!started && !shutDown && (
							<Button
								tone="primary"
								onClick={() => setUi({ view: "startday" })}
							>
								<Sunrise size={15} /> Start my day
							</Button>
						)}
						{started && !shutDown && (
							<Button
								tone={pastShutdown ? "primary" : "ghost"}
								onClick={() => setUi({ view: "shutdown" })}
							>
								<Moon size={15} /> Shutdown
							</Button>
						)}
					</div>
				</header>

				<DeepRing date={today} />

				{reviewDue && (
					<button
						type="button"
						onClick={() => setUi({ view: "review" })}
						className="flex items-center justify-between rounded-[11px] border border-[#5c3346] bg-[#2c1f26] px-3.5 py-2.5 text-left text-[12.5px] text-[#f3c4d4] hover:brightness-110 cursor-pointer"
					>
						<span>
							New week. Take 10 minutes to review last week and set this week's
							project budgets.
						</span>
						<span className="text-fg">Weekly review →</span>
					</button>
				)}

				{overdue.length > 0 && (
					<button
						type="button"
						onClick={() => setUi({ view: "startday" })}
						className="flex items-center justify-between rounded-[11px] border border-line bg-surface px-3.5 py-2.5 text-left text-[12.5px] text-muted hover:border-line-strong cursor-pointer"
					>
						<span>
							<b className="text-fg">{overdue.length}</b> unfinished task
							{overdue.length === 1 ? "" : "s"} from earlier days. Keep, move or
							drop them.
						</span>
						<span className="text-fg">Review →</span>
					</button>
				)}

				<CapacityBanner date={today} />

				<section className="flex flex-col gap-2">
					<SectionLabel right={<span>{top3.length}/3</span>}>
						Top 3
					</SectionLabel>
					{top3.length === 0 ? (
						<EmptyState title="No big rocks yet">
							Star up to three tasks that would make today a good day, or add
							one with "!".
						</EmptyState>
					) : (
						top3.map((t) => (
							<TaskRow
								key={t.id}
								task={t}
								project={projectById.get(t.projectId ?? -1)}
								onSplit={setSplitting}
							/>
						))
					)}
				</section>

				<section className="flex flex-col gap-2">
					<SectionLabel right={<span>{rest.length}</span>}>
						Also today
					</SectionLabel>
					{rest.map((t) => (
						<TaskRow
							key={t.id}
							task={t}
							project={projectById.get(t.projectId ?? -1)}
							onSplit={setSplitting}
						/>
					))}
					<TaskComposer projects={projects} plannedFor={today} autoFocusKey />
				</section>

				{done.length > 0 && (
					<section className="flex flex-col gap-2">
						<SectionLabel right={<span>{done.length}</span>}>Done</SectionLabel>
						{done.map((t) => (
							<TaskRow
								key={t.id}
								task={t}
								project={projectById.get(t.projectId ?? -1)}
								compact
							/>
						))}
					</section>
				)}
			</div>

			<div className="min-h-0 overflow-y-auto pb-10">
				<Timeline date={today} tasks={tasks} projects={projects} />
			</div>

			<SplitDialog task={splitting} onClose={() => setSplitting(null)} />
		</div>
	);
}

function DeepRing({ date }: { date: string }) {
	const { data: stats } = useDayStats(date);
	if (!stats) return null;
	const target = stats.targetMin * 60;
	const pct = Math.min(1, stats.focusSec / Math.max(1, target));
	return (
		<div className="flex items-center gap-4 rounded-[14px] border border-line bg-surface px-4 py-3">
			<div
				className="relative size-11 shrink-0 rounded-full"
				style={{
					background: `conic-gradient(var(--color-fg) ${pct}turn, #2a2830 0)`,
				}}
			>
				<div className="absolute inset-[5px] rounded-full bg-surface" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
						Deep work today
					</span>
					<span className="font-mono text-[13px] tabular">
						{formatMinutes(stats.focusSec / 60)}{" "}
						<span className="text-muted">
							/ {formatMinutes(stats.targetMin)}
						</span>
					</span>
				</div>
				<div className="mt-2 flex h-2 gap-[2px] overflow-hidden rounded-full bg-[#2a2830]">
					{stats.perProject.map((p) => (
						<div
							key={p.projectId ?? "none"}
							title={`${p.name}: ${formatMinutes(p.sec / 60)}`}
							style={{
								width: `${(p.sec / Math.max(target, stats.focusSec)) * 100}%`,
								background: p.color,
							}}
						/>
					))}
				</div>
			</div>
			<div className="hidden gap-4 text-center lg:flex">
				<Stat label="sessions" value={stats.sessions} />
				<Stat label="done" value={stats.tasksDone} />
				<Stat label="urges" value={stats.urges} />
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div>
			<div className="font-mono text-[15px] tabular">{value}</div>
			<div className="text-[10.5px] text-muted">{label}</div>
		</div>
	);
}
