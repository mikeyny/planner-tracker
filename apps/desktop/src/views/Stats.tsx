import { formatMinutes } from "@deep/shared";
import { EmptyState, ProjectDot, SectionLabel } from "../components/ui";
import {
	useCaptures,
	useDay,
	useDayStats,
	useMultipliers,
	useProjects,
	useToday,
} from "../lib/queries";

export function StatsView() {
	const today = useToday();
	const { data: stats } = useDayStats(today);
	const { data: mult } = useMultipliers();
	const { data: day } = useDay(today);
	const { data: projects = [] } = useProjects();
	const { data: urges = [] } = useCaptures("all");
	const projectById = new Map(projects.map((p) => [p.id, p]));
	const todayUrges = urges.filter(
		(c) =>
			c.kind !== "parking" &&
			new Date(c.createdAt).toDateString() === new Date().toDateString(),
	);

	if (!stats) return null;
	const pct = Math.round(
		(stats.focusSec / 60 / Math.max(1, stats.targetMin)) * 100,
	);
	const maxSec = Math.max(1, ...stats.perProject.map((p) => p.sec));

	return (
		<div className="mx-auto flex h-full min-h-0 max-w-[980px] flex-col gap-6 overflow-y-auto pb-10">
			<header>
				<h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
					Today in numbers
				</h1>
				<p className="mt-1 text-[13px] text-muted">
					Data, not judgement. Patterns show up after a week or two.
				</p>
			</header>

			<div className="grid grid-cols-4 gap-3">
				<Tile
					label="Focused"
					value={formatMinutes(stats.focusSec / 60)}
					sub={`${pct}% of ${formatMinutes(stats.targetMin)} target`}
				/>
				<Tile
					label="Sessions"
					value={String(stats.sessions)}
					sub={`${stats.switches} project switch${stats.switches === 1 ? "" : "es"}`}
				/>
				<Tile label="Tasks done" value={String(stats.tasksDone)} />
				<Tile
					label="Pulled away"
					value={String(stats.urges + stats.interruptions)}
					sub={`${stats.urges} urge${stats.urges === 1 ? "" : "s"} · ${stats.interruptions} interruption${stats.interruptions === 1 ? "" : "s"}`}
				/>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
					<SectionLabel>Time by project</SectionLabel>
					{stats.perProject.length === 0 && (
						<p className="text-[13px] text-muted">
							No focus sessions yet today.
						</p>
					)}
					{stats.perProject.map((p) => (
						<div
							key={p.projectId ?? "none"}
							className="grid grid-cols-[110px_minmax(0,1fr)_54px] items-center gap-3 text-[12.5px]"
						>
							<span className="flex items-center gap-2 truncate">
								<ProjectDot color={p.color} /> {p.name}
							</span>
							<div className="h-3">
								<div
									className="h-full rounded-r-[4px]"
									style={{
										width: `${(p.sec / maxSec) * 100}%`,
										background: p.color,
									}}
								/>
							</div>
							<span className="text-right font-mono text-[11px] tabular">
								{formatMinutes(p.sec / 60)}
							</span>
						</div>
					))}
				</section>

				<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
					<SectionLabel>How long things really take</SectionLabel>
					<p className="text-[12px] text-muted">
						Actual time ÷ your estimate, from finished tasks (last 60 days).
					</p>
					{mult?.overall.value ? (
						<div className="flex flex-wrap gap-6">
							<div>
								<div className="font-display text-[32px] font-extrabold leading-none tabular">
									{mult.overall.value}×
								</div>
								<div className="mt-1 text-[11px] text-muted">
									all projects · {mult.overall.samples} tasks
								</div>
							</div>
							{mult.perProject
								.filter((m) => m.value)
								.map((m) => (
									<div key={m.projectId ?? "none"}>
										<div className="font-display text-[22px] font-bold leading-none tabular">
											{m.value}×
										</div>
										<div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
											<ProjectDot color={m.color} /> {m.name}
										</div>
									</div>
								))}
						</div>
					) : (
						<p className="text-[13px] text-muted">
							Learning… Finish {Math.max(0, 3 - (mult?.overall.samples ?? 0))}{" "}
							more estimated tasks with tracked time to see your multiplier.
						</p>
					)}
				</section>
			</div>

			<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
				<SectionLabel>Sessions today</SectionLabel>
				{(day?.sessions.filter((s) => s.kind === "focus").length ?? 0) === 0 ? (
					<EmptyState title="No sessions yet" />
				) : (
					<div className="flex flex-col gap-1.5">
						{day?.sessions
							.filter((s) => s.kind === "focus")
							.map((s) => {
								const p = projectById.get(s.projectId ?? -1);
								return (
									<div
										key={s.id}
										className="grid grid-cols-[110px_14px_minmax(0,1fr)_70px_80px] items-center gap-3 text-[12.5px]"
									>
										<span className="font-mono text-[11px] text-muted">
											{new Date(s.startedAt).toLocaleTimeString([], {
												hour: "2-digit",
												minute: "2-digit",
											})}
											{s.endedAt &&
												`–${new Date(s.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
										</span>
										<ProjectDot color={p?.color} />
										<span className="truncate">{p?.name ?? "No project"}</span>
										<span className="font-mono text-[11px]">
											{s.activeSec != null
												? formatMinutes(s.activeSec / 60)
												: "running"}
										</span>
										<span className="text-[11px] text-muted">
											{s.outcome ?? ""}
										</span>
									</div>
								);
							})}
					</div>
				)}
			</section>

			{todayUrges.length > 0 && (
				<section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-4">
					<SectionLabel>When you got pulled away</SectionLabel>
					<div className="flex flex-wrap gap-2">
						{todayUrges.map((c) => (
							<span
								key={c.id}
								className="rounded-full bg-raised px-2.5 py-1 font-mono text-[11px] text-muted"
							>
								{new Date(c.createdAt).toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								})}{" "}
								{c.kind}
							</span>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

function Tile({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div className="rounded-[14px] border border-line bg-surface p-4">
			<div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
				{label}
			</div>
			<div className="mt-1.5 font-display text-[28px] font-extrabold leading-none tabular">
				{value}
			</div>
			{sub && <div className="mt-1.5 text-[11.5px] text-muted">{sub}</div>}
		</div>
	);
}
