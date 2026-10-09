import {
	addDays,
	formatMinutes,
	type Heatmap,
	localDate,
	mondayOf,
	type WeekStats,
} from "@deep/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
	Button,
	cx,
	IconButton,
	ProjectDot,
	SectionLabel,
} from "../components/ui";
import { useHeatmap, useMultipliers, useWeekStats } from "../lib/queries";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Sequential blue, dark → light = less → more (on the dark surface). */
const RAMP = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

export function weekLabel(start: string) {
	const a = new Date(`${start}T12:00:00`);
	const b = new Date(`${addDays(start, 6)}T12:00:00`);
	const sameMonth = a.getMonth() === b.getMonth();
	const day = (d: Date) => d.getDate();
	const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
	return sameMonth
		? `${day(a)}–${day(b)} ${month(b)}`
		: `${day(a)} ${month(a)} – ${day(b)} ${month(b)}`;
}

export function WeekView() {
	const thisMonday = mondayOf(localDate());
	const [start, setStart] = useState(thisMonday);
	const { data: w } = useWeekStats(start);
	const { data: heat } = useHeatmap(4);
	const { data: mult } = useMultipliers();
	const isThisWeek = start === thisMonday;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex items-center gap-2">
				<IconButton
					label="Previous week"
					onClick={() => setStart(addDays(start, -7))}
				>
					<ChevronLeft size={16} />
				</IconButton>
				<span className="min-w-[150px] text-center font-mono text-[13px]">
					{weekLabel(start)}
				</span>
				<IconButton
					label="Next week"
					onClick={() => setStart(addDays(start, 7))}
					disabled={isThisWeek}
				>
					<ChevronRight size={16} />
				</IconButton>
				{!isThisWeek && (
					<Button size="sm" tone="quiet" onClick={() => setStart(thisMonday)}>
						This week
					</Button>
				)}
			</div>

			{w && <WeekBody w={w} heat={heat} mult={mult} />}
		</div>
	);
}

function WeekBody({
	w,
	heat,
	mult,
}: {
	w: WeekStats;
	heat?: Heatmap;
	mult?: ReturnType<typeof useMultipliers>["data"];
}) {
	const pct = Math.round((w.focusSec / Math.max(1, w.targetSec)) * 100);
	const total = Math.max(1, w.focusSec);
	const deepPct = Math.round((w.energy.deep / total) * 100);
	return (
		<>
			<div className="grid grid-cols-4 gap-3">
				<Tile
					label="Focused"
					value={formatMinutes(w.focusSec / 60)}
					sub={`${pct}% of ${formatMinutes(w.targetSec / 60)} weekday target`}
				/>
				<Tile
					label="Days on target"
					value={`${w.daysOnTarget}/5`}
					sub={`${w.sessions} session${w.sessions === 1 ? "" : "s"} · longest ${formatMinutes(w.longestSessionSec / 60)}`}
				/>
				<Tile
					label="Deep work"
					value={w.focusSec ? `${deepPct}%` : "–"}
					sub="of focused time was deep work"
				/>
				<Tile
					label="Switches per day"
					value={String(w.switchesPerDay)}
					sub="project changes on days you worked"
				/>
			</div>

			<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
				<SectionLabel
					right={<Legend projects={w.perProject.filter((p) => p.sec > 0)} />}
				>
					Focus by day
				</SectionLabel>
				<DailyBars w={w} />
			</section>

			<div className="grid grid-cols-2 gap-4">
				<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
					<SectionLabel
						right={
							<span className="normal-case tracking-normal">
								bar = this week · tick = target
							</span>
						}
					>
						Projects vs weekly targets
					</SectionLabel>
					<ProjectTargets w={w} />
				</section>
				<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
					<SectionLabel>Your best focus hours · last 4 weeks</SectionLabel>
					{heat ? <HeatGrid heat={heat} /> : null}
				</section>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
					<SectionLabel
						right={
							<span>
								{w.urges} urges · {w.interruptions} interruptions
							</span>
						}
					>
						When you got pulled away
					</SectionLabel>
					<HourBars values={w.distractionsByHour} />
					{w.topDistractions.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{w.topDistractions.map((d) => (
								<span
									key={d.text}
									className="rounded-full bg-raised px-2.5 py-1 text-[12px]"
								>
									{d.text}{" "}
									<span className="font-mono text-muted">×{d.count}</span>
								</span>
							))}
						</div>
					) : (
						<p className="text-[12px] text-muted">
							Name your urges (U in focus, or the Urge option in quick capture)
							to see patterns here.
						</p>
					)}
				</section>
				<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
					<SectionLabel>How long things really take</SectionLabel>
					{mult?.overall.value ? (
						<div className="flex flex-wrap gap-6">
							<div>
								<div className="font-display text-[30px] font-extrabold leading-none tabular">
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
										<div className="font-display text-[20px] font-bold leading-none tabular">
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
							Learning… finish a few estimated tasks with tracked time.
						</p>
					)}
					<p className="text-[12px] text-muted">
						Actual time ÷ estimate, from tasks finished in the last 60 days.
						Planning uses this.
					</p>
				</section>
			</div>
		</>
	);
}

export function Tile({
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

function Legend({
	projects,
}: {
	projects: { projectId: number | null; name: string; color: string }[];
}) {
	return (
		<span className="flex flex-wrap items-center gap-3 normal-case tracking-normal">
			{projects.map((p) => (
				<span key={p.projectId ?? "none"} className="flex items-center gap-1.5">
					<ProjectDot color={p.color} /> {p.name}
				</span>
			))}
		</span>
	);
}

export function DailyBars({ w }: { w: WeekStats }) {
	const target = w.targetSec / 5;
	const max = Math.max(target * 1.25, ...w.days.map((d) => d.focusSec), 1);
	const H = 160;
	const today = localDate();
	return (
		<div
			className="relative grid grid-cols-7 gap-3 pt-4"
			style={{ height: H + 44 }}
		>
			<div
				className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-faint"
				style={{ top: 16 + H - (target / max) * H }}
			>
				<span className="absolute -top-4 right-0 font-mono text-[10px] text-muted">
					target {formatMinutes(target / 60)}
				</span>
			</div>
			{w.days.map((d, i) => (
				<div key={d.date} className="flex flex-col items-center gap-1.5">
					<div
						className="flex w-full max-w-[56px] flex-col-reverse gap-[2px]"
						style={{ height: H }}
					>
						{d.perProject.map((p, j) => (
							<div
								key={p.projectId ?? "none"}
								title={`${p.name}: ${formatMinutes(p.sec / 60)}`}
								className={cx(
									"w-full",
									j === d.perProject.length - 1 && "rounded-t-[4px]",
								)}
								style={{ height: (p.sec / max) * H, background: p.color }}
							/>
						))}
					</div>
					<span
						className={cx(
							"text-[11.5px]",
							d.date === today ? "font-semibold text-fg" : "text-muted",
						)}
					>
						{DAY_LABELS[i]}
					</span>
					<span className="font-mono text-[10.5px] text-muted tabular">
						{d.focusSec ? formatMinutes(d.focusSec / 60) : "–"}
					</span>
				</div>
			))}
		</div>
	);
}

export function ProjectTargets({ w }: { w: WeekStats }) {
	const rows = w.perProject.filter((p) => p.sec > 0 || p.targetMin);
	if (rows.length === 0)
		return (
			<p className="text-[13px] text-muted">No focus time this week yet.</p>
		);
	const max = Math.max(
		...rows.map((p) => Math.max(p.sec / 60, p.targetMin ?? 0)),
		1,
	);
	return (
		<div className="flex flex-col gap-3">
			{rows.map((p) => {
				const min = p.sec / 60;
				const over = p.targetMin ? min >= p.targetMin : false;
				return (
					<div
						key={p.projectId ?? "none"}
						className="grid grid-cols-[110px_minmax(0,1fr)_112px] items-center gap-3 text-[12.5px]"
					>
						<span className="flex items-center gap-2 truncate">
							<ProjectDot color={p.color} /> {p.name}
						</span>
						<div className="relative h-3.5">
							<div
								className="absolute top-0.5 bottom-0.5 left-0 rounded-r-[4px]"
								style={{ width: `${(min / max) * 100}%`, background: p.color }}
								title={`${p.name}: ${formatMinutes(min)}${p.targetMin ? ` of ${formatMinutes(p.targetMin)}` : ""}`}
							/>
							{p.targetMin ? (
								<div
									className="absolute -top-0.5 -bottom-0.5 w-[2px] rounded bg-fg"
									style={{ left: `${(p.targetMin / max) * 100}%` }}
								/>
							) : null}
						</div>
						<span
							className={cx(
								"text-right font-mono text-[11px] tabular",
								over ? "text-good" : "text-muted",
							)}
						>
							{formatMinutes(min)}
							{p.targetMin ? ` / ${formatMinutes(p.targetMin)}` : ""}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function HeatGrid({ heat }: { heat: Heatmap }) {
	const hours = Array.from({ length: 13 }, (_, i) => 7 + i);
	const max = Math.max(1, ...heat.cells.map((c) => c.focusSec));
	const cell = (dow: number, hour: number) =>
		heat.cells.find((c) => c.dow === dow && c.hour === hour);
	const shade = (sec: number) =>
		sec <= 0
			? "#1d1c22"
			: RAMP[Math.min(RAMP.length - 1, Math.floor((sec / max) * RAMP.length))]!;
	return (
		<div className="flex flex-col gap-2">
			<div
				className="grid gap-[3px]"
				style={{
					gridTemplateColumns: `34px repeat(${hours.length}, minmax(0, 1fr))`,
				}}
			>
				<span />
				{hours.map((h) => (
					<span
						key={h}
						className="text-center font-mono text-[9.5px] text-faint"
					>
						{h % 2 ? "" : h}
					</span>
				))}
				{DAY_LABELS.slice(0, 5).map((label, dow) => (
					<HeatRow
						key={label}
						label={label}
						hours={hours}
						get={(h) => cell(dow, h)}
						shade={shade}
					/>
				))}
			</div>
			<div className="flex items-center justify-between text-[11px] text-muted">
				<span className="flex items-center gap-1.5 font-mono text-[10px]">
					less
					{RAMP.map((c) => (
						<i
							key={c}
							className="block h-2 w-3.5 rounded-[2px]"
							style={{ background: c }}
						/>
					))}
					more
				</span>
				{heat.bestHours.length > 0 && (
					<span>
						Best hours:{" "}
						<b className="font-mono text-fg">
							{heat.bestHours.map((h) => `${h}:00`).join(" · ")}
						</b>
					</span>
				)}
			</div>
		</div>
	);
}

function HeatRow({
	label,
	hours,
	get,
	shade,
}: {
	label: string;
	hours: number[];
	get: (hour: number) => Heatmap["cells"][number] | undefined;
	shade: (sec: number) => string;
}) {
	return (
		<>
			<span className="flex items-center font-mono text-[10px] text-muted">
				{label}
			</span>
			{hours.map((h) => {
				const c = get(h);
				const sec = c?.focusSec ?? 0;
				return (
					<i
						key={h}
						className="block aspect-[1.3] rounded-[3px]"
						style={{ background: shade(sec) }}
						title={`${label} ${h}:00 · ${formatMinutes(sec / 60)} focused${c?.avgRating ? ` · focus ${c.avgRating}/5` : ""}`}
					/>
				);
			})}
		</>
	);
}

function HourBars({ values }: { values: number[] }) {
	const hours = Array.from({ length: 13 }, (_, i) => 7 + i);
	const max = Math.max(1, ...hours.map((h) => values[h] ?? 0));
	return (
		<div className="flex flex-col gap-1">
			<div className="flex h-16 items-end gap-[3px]">
				{hours.map((h) => (
					<div
						key={h}
						className="flex-1 rounded-t-[3px] bg-warn"
						style={{
							height: `${((values[h] ?? 0) / max) * 100}%`,
							minHeight: values[h] ? 3 : 0,
						}}
						title={`${h}:00 · ${values[h] ?? 0}`}
					/>
				))}
			</div>
			<div className="flex gap-[3px] font-mono text-[9.5px] text-faint">
				{hours.map((h) => (
					<span key={h} className="flex-1 text-center">
						{h % 3 === 0 ? h : ""}
					</span>
				))}
			</div>
		</div>
	);
}
