import { formatMinutes, type Task } from "@deep/shared";
import {
	ArrowLeft,
	Check,
	Inbox,
	Loader2,
	Sparkles,
	Star,
	Sun,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	Button,
	cx,
	EmptyState,
	inputCls,
	ProjectChip,
	SectionLabel,
} from "../components/ui";
import { api } from "../lib/api";
import {
	queryClient,
	tomorrowOf,
	useCaptures,
	useDay,
	useDayStats,
	useProjects,
	useTasks,
	useToday,
	useUpdateTask,
} from "../lib/queries";
import { attempt, setUi } from "../lib/ui";

export function ShutdownView() {
	const today = useToday();
	const tomorrow = tomorrowOf(today);
	const { data: tasks = [] } = useTasks("today", today);
	const { data: tomorrowTasks = [] } = useTasks("today", tomorrow);
	const { data: projects = [] } = useProjects();
	const { data: stats } = useDayStats(today);
	const { data: day } = useDay(today);
	const { data: caps = [] } = useCaptures("open");
	const update = useUpdateTask();

	const [wentWell, setWentWell] = useState("");
	const [gotInWay, setGotInWay] = useState("");
	const [energy, setEnergy] = useState<number | null>(null);
	const [summary, setSummary] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [complete, setComplete] = useState(false);

	useEffect(() => {
		if (!day) return;
		setWentWell(day.plan.wentWell ?? "");
		setGotInWay(day.plan.gotInWay ?? "");
		setEnergy(day.plan.energyRating);
		setSummary(day.plan.aiSummary);
	}, [day]);

	const projectById = new Map(projects.map((p) => [p.id, p]));
	const unfinished = tasks.filter((t) => t.status === "open");
	const worked = tasks.filter((t) => t.spentSec > 0 || t.status === "done");
	const maxMin = Math.max(
		30,
		...worked.map((t) => Math.max(t.estimateMin ?? 0, t.spentSec / 60)),
	);

	const moveTask = async (t: Task, action: "tomorrow" | "inbox" | "drop") => {
		if (action === "tomorrow") {
			await attempt(() =>
				api.post("/tasks/rollover", {
					date: tomorrow,
					ids: [t.id],
					action: "today",
				}),
			);
		} else {
			await attempt(() =>
				api.post("/tasks/rollover", {
					date: today,
					ids: [t.id],
					action: action === "inbox" ? "inbox" : "drop",
				}),
			);
		}
		queryClient.invalidateQueries({ queryKey: ["tasks"] });
	};

	const triage = async (id: number, action: "inbox" | "today" | "delete") => {
		await attempt(() =>
			api.patch(`/captures/${id}`, { action, date: tomorrow }),
		);
		queryClient.invalidateQueries({ queryKey: ["captures"] });
	};

	const saveReflection = () =>
		api.put(`/day/${today}`, {
			wentWell: wentWell || null,
			gotInWay: gotInWay || null,
			energyRating: energy,
		});

	const summarize = async () => {
		setBusy(true);
		await attempt(saveReflection);
		const res = await attempt(() =>
			api.post<{ summary: string }>(`/day/${today}/summary`),
		);
		setBusy(false);
		if (res) setSummary(res.summary);
	};

	const finish = async () => {
		await attempt(saveReflection);
		const ok = await attempt(() =>
			api.put(`/day/${today}`, { shutdownAt: new Date().toISOString() }),
		);
		if (ok === undefined) return;
		queryClient.invalidateQueries({ queryKey: ["day"] });
		setComplete(true);
	};

	if (complete) {
		return (
			<div className="grid h-full place-items-center">
				<div className="flex max-w-[460px] flex-col items-center gap-4 text-center">
					<div className="grid size-16 place-items-center rounded-full bg-[#12261a] text-[#9fe3a9]">
						<Check size={30} strokeWidth={3} />
					</div>
					<h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
						Shutdown complete
					</h1>
					<p className="text-[14px] text-muted">
						Everything is captured and tomorrow has a plan. You can stop
						thinking about work now.
					</p>
					<Button onClick={() => setUi({ view: "today" })}>
						Back to today
					</Button>
				</div>
			</div>
		);
	}

	const topTomorrow = tomorrowTasks.filter((t) => t.status === "open");

	return (
		<div className="flex h-full min-h-0 flex-col gap-5">
			<header className="flex items-center gap-4">
				<Button tone="quiet" size="sm" onClick={() => setUi({ view: "today" })}>
					<ArrowLeft size={14} /> Today
				</Button>
				<h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">
					Shutdown
				</h1>
				{stats && (
					<span className="ml-auto font-mono text-[12px] text-muted">
						{formatMinutes(stats.focusSec / 60)} focused · {stats.tasksDone}{" "}
						done · {stats.switches} switches
					</span>
				)}
			</header>

			<div className="grid min-h-0 flex-1 grid-cols-2 gap-6 overflow-y-auto pb-10">
				<div className="flex flex-col gap-6">
					<section className="flex flex-col gap-2.5">
						<SectionLabel
							right={
								<span className="flex items-center gap-3 normal-case tracking-normal">
									<span className="flex items-center gap-1">
										<span className="inline-block h-1.5 w-3.5 border border-[#6a6672]" />{" "}
										estimate
									</span>
									<span className="flex items-center gap-1">
										<span className="inline-block h-1.5 w-3.5 rounded-r bg-fg" />{" "}
										actual
									</span>
								</span>
							}
						>
							Planned vs actual
						</SectionLabel>
						{worked.length === 0 && (
							<EmptyState title="No tracked work today">
								That's information too.
							</EmptyState>
						)}
						{worked.map((t) => {
							const p = projectById.get(t.projectId ?? -1);
							const act = t.spentSec / 60;
							return (
								<div
									key={t.id}
									className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_64px] items-center gap-3 text-[12.5px]"
								>
									<span className="truncate" title={t.title}>
										{t.title}
									</span>
									<div className="flex flex-col gap-[3px]">
										{t.estimateMin ? (
											<span
												className="h-1.5 border border-[#6a6672]"
												style={{ width: `${(t.estimateMin / maxMin) * 100}%` }}
											/>
										) : (
											<span className="h-1.5" />
										)}
										<span
											className="h-1.5 rounded-r"
											style={{
												width: `${(act / maxMin) * 100}%`,
												background: p?.color ?? "#6f6a78",
											}}
										/>
									</div>
									<span className="text-right font-mono text-[11px] text-muted">
										{formatMinutes(act)} {t.status === "done" ? "✓" : "→"}
									</span>
								</div>
							);
						})}
					</section>

					<section className="flex flex-col gap-2">
						<SectionLabel right={<span>{unfinished.length}</span>}>
							Not finished
						</SectionLabel>
						{unfinished.length === 0 && (
							<EmptyState title="Nothing left over" />
						)}
						{unfinished.map((t) => (
							<div
								key={t.id}
								className="flex items-center gap-2 rounded-[11px] border border-line bg-surface px-3 py-2"
							>
								<div className="min-w-0 flex-1">
									<div className="truncate text-[13px] font-semibold">
										{t.title}
									</div>
									<ProjectChip
										project={projectById.get(t.projectId ?? -1)}
										className="mt-1"
									/>
								</div>
								<Button size="sm" onClick={() => moveTask(t, "tomorrow")}>
									<Sun size={13} /> Tomorrow
								</Button>
								<Button
									size="sm"
									tone="quiet"
									onClick={() => moveTask(t, "inbox")}
								>
									<Inbox size={13} />
								</Button>
								<Button
									size="sm"
									tone="quiet"
									onClick={() => moveTask(t, "drop")}
								>
									<Trash2 size={13} />
								</Button>
							</div>
						))}
					</section>

					{caps.length > 0 && (
						<section className="flex flex-col gap-2">
							<SectionLabel right={<span>{caps.length}</span>}>
								Parking lot
							</SectionLabel>
							{caps.map((c) => (
								<div
									key={c.id}
									className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-[13px]"
								>
									<span className="min-w-0 flex-1 truncate">{c.text}</span>
									<Button
										size="sm"
										tone="quiet"
										onClick={() => triage(c.id, "today")}
									>
										Tomorrow
									</Button>
									<Button
										size="sm"
										tone="quiet"
										onClick={() => triage(c.id, "inbox")}
									>
										Inbox
									</Button>
									<Button
										size="sm"
										tone="quiet"
										onClick={() => triage(c.id, "delete")}
									>
										<Trash2 size={13} />
									</Button>
								</div>
							))}
						</section>
					)}
				</div>

				<div className="flex flex-col gap-5">
					<section className="flex flex-col gap-3">
						<SectionLabel>Reflect</SectionLabel>
						<label className="flex flex-col gap-1.5 text-[12px] font-semibold text-muted">
							What went well?
							<input
								className={inputCls}
								value={wentWell}
								onChange={(e) => setWentWell(e.target.value)}
							/>
						</label>
						<label className="flex flex-col gap-1.5 text-[12px] font-semibold text-muted">
							What got in the way?
							<input
								className={inputCls}
								value={gotInWay}
								onChange={(e) => setGotInWay(e.target.value)}
							/>
						</label>
						<div className="flex items-center gap-3 text-[12px] font-semibold text-muted">
							Energy today
							<div className="flex gap-1">
								{[1, 2, 3, 4, 5].map((n) => (
									<button
										key={n}
										type="button"
										aria-label={`Energy ${n} of 5`}
										onClick={() => setEnergy(n)}
										className={cx(
											"size-7 rounded-lg border font-mono cursor-pointer",
											energy !== null && n <= energy
												? "border-warn bg-warn text-bg"
												: "border-line text-muted",
										)}
									>
										{n}
									</button>
								))}
							</div>
						</div>
					</section>

					<section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-4">
						<SectionLabel
							right={
								<Button
									size="sm"
									tone="quiet"
									onClick={summarize}
									disabled={busy}
								>
									{busy ? (
										<Loader2 size={13} className="animate-spin" />
									) : (
										<Sparkles size={13} />
									)}
									{summary ? "Rewrite" : "Summarise my day"}
								</Button>
							}
						>
							Summary
						</SectionLabel>
						<p className="text-[13.5px] leading-relaxed">
							{summary ?? (
								<span className="text-muted">
									Get a short summary of the day from your numbers and notes.
								</span>
							)}
						</p>
					</section>

					<section className="flex flex-col gap-2">
						<SectionLabel
							right={
								<span>{topTomorrow.filter((t) => t.isTop3).length}/3</span>
							}
						>
							Tomorrow's top 3
						</SectionLabel>
						{topTomorrow.length === 0 && (
							<p className="text-[12.5px] text-muted">
								Move tasks to tomorrow on the left, then star the ones that
								matter.
							</p>
						)}
						{topTomorrow.map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() => update.mutate({ id: t.id, isTop3: !t.isTop3 })}
								className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-left text-[13px] cursor-pointer hover:border-line-strong"
							>
								<Star
									size={15}
									className={t.isTop3 ? "fill-warn text-warn" : "text-faint"}
								/>
								{t.title}
							</button>
						))}
					</section>

					<Button tone="primary" size="lg" onClick={finish} className="mt-auto">
						<Check size={16} /> Shutdown complete
					</Button>
				</div>
			</div>
		</div>
	);
}
