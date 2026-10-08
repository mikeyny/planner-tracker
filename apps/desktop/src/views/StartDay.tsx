import {
	type Energy,
	type ExtractedTask,
	hhmmToMin,
	type Task,
} from "@deep/shared";
import {
	ArrowLeft,
	CalendarClock,
	Loader2,
	Sparkles,
	Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CapacityBanner } from "../components/Capacity";
import { TaskRow } from "../components/TaskRow";
import { Timeline } from "../components/Timeline";
import {
	Button,
	cx,
	EmptyState,
	inputCls,
	SectionLabel,
} from "../components/ui";
import { VoiceDump } from "../components/VoiceDump";
import { api } from "../lib/api";
import {
	queryClient,
	useAiStatus,
	useProjects,
	useTasks,
	useToday,
	useUpdateTask,
} from "../lib/queries";
import { attempt, setUi, toast } from "../lib/ui";

type Step = "leftovers" | "dump" | "review" | "plan";

interface Draft extends ExtractedTask {
	uid: number;
	include: boolean;
}

let nextUid = 1;

export function StartDayView() {
	const today = useToday();
	const { data: overdue = [], isFetched } = useTasks("overdue", today);
	const [step, setStep] = useState<Step>("dump");
	const [checkedLeftovers, setCheckedLeftovers] = useState(false);
	const [dump, setDump] = useState("");
	const [drafts, setDrafts] = useState<Draft[]>([]);

	useEffect(() => {
		if (isFetched && !checkedLeftovers) {
			setCheckedLeftovers(true);
			if (overdue.length > 0) setStep("leftovers");
		}
	}, [isFetched, overdue.length, checkedLeftovers]);

	const steps: { id: Step; label: string }[] = [
		...(overdue.length > 0 || step === "leftovers"
			? [{ id: "leftovers" as Step, label: "Leftovers" }]
			: []),
		{ id: "dump", label: "Brain dump" },
		{ id: "review", label: "Review" },
		{ id: "plan", label: "Top 3 & timebox" },
	];

	return (
		<div className="flex h-full min-h-0 flex-col gap-5">
			<header className="flex flex-wrap items-center gap-4">
				<Button tone="quiet" size="sm" onClick={() => setUi({ view: "today" })}>
					<ArrowLeft size={14} /> Today
				</Button>
				<h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">
					Start my day
				</h1>
				<ol className="ml-auto flex items-center gap-1.5">
					{steps.map((s, i) => (
						<li
							key={s.id}
							className={cx(
								"rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
								s.id === step ? "bg-fg text-bg" : "text-muted",
							)}
						>
							<span className="mr-1 font-mono">{i + 1}</span>
							{s.label}
						</li>
					))}
				</ol>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto pb-10">
				{step === "leftovers" && (
					<Leftovers
						tasks={overdue}
						today={today}
						onNext={() => setStep("dump")}
					/>
				)}
				{step === "dump" && (
					<DumpStep
						value={dump}
						onChange={setDump}
						onExtracted={(tasks) => {
							setDrafts(
								tasks.map((t) => ({ ...t, uid: nextUid++, include: true })),
							);
							setStep("review");
						}}
						onSkip={() => {
							setDrafts([]);
							setStep("review");
						}}
					/>
				)}
				{step === "review" && (
					<ReviewStep
						drafts={drafts}
						setDrafts={setDrafts}
						today={today}
						onBack={() => setStep("dump")}
						onNext={() => setStep("plan")}
					/>
				)}
				{step === "plan" && <PlanStep today={today} />}
			</div>
		</div>
	);
}

function Leftovers({
	tasks,
	today,
	onNext,
}: {
	tasks: Task[];
	today: string;
	onNext: () => void;
}) {
	const { data: projects = [] } = useProjects();
	const move = async (ids: number[], action: "today" | "inbox" | "drop") => {
		await attempt(() =>
			api.post("/tasks/rollover", { date: today, ids, action }),
		);
		queryClient.invalidateQueries({ queryKey: ["tasks"] });
	};
	return (
		<div className="mx-auto flex max-w-[760px] flex-col gap-4">
			<div>
				<h2 className="font-display text-[19px] font-bold">
					Unfinished from earlier
				</h2>
				<p className="mt-1 text-[13px] text-muted">
					No guilt. Decide once: keep it for today, park it in the inbox, or let
					it go.
				</p>
			</div>
			{tasks.length === 0 ? (
				<EmptyState title="All sorted" />
			) : (
				<div className="flex flex-col gap-2">
					{tasks.map((t) => (
						<div key={t.id} className="flex items-center gap-3">
							<div className="min-w-0 flex-1">
								<TaskRow
									task={t}
									project={projects.find((p) => p.id === t.projectId)}
									draggable={false}
								/>
							</div>
							<div className="flex gap-1">
								<Button size="sm" onClick={() => move([t.id], "today")}>
									Today
								</Button>
								<Button
									size="sm"
									tone="quiet"
									onClick={() => move([t.id], "inbox")}
								>
									Inbox
								</Button>
								<Button
									size="sm"
									tone="quiet"
									onClick={() => move([t.id], "drop")}
								>
									Drop
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
			<div className="flex justify-between">
				{tasks.length > 1 ? (
					<Button
						tone="quiet"
						onClick={() =>
							move(
								tasks.map((t) => t.id),
								"today",
							)
						}
					>
						Keep all for today
					</Button>
				) : (
					<span />
				)}
				<Button tone="primary" onClick={onNext}>
					Next
				</Button>
			</div>
		</div>
	);
}

function DumpStep({
	value,
	onChange,
	onExtracted,
	onSkip,
}: {
	value: string;
	onChange: (v: string) => void;
	onExtracted: (t: ExtractedTask[]) => void;
	onSkip: () => void;
}) {
	const { data: ai } = useAiStatus();
	const [busy, setBusy] = useState(false);
	const extract = async () => {
		setBusy(true);
		const res = await attempt(() =>
			api.post<{ tasks: ExtractedTask[]; ai: boolean; error?: string }>(
				"/ai/extract",
				{ text: value },
			),
		);
		setBusy(false);
		if (!res) return;
		if (res.error) toast(`${res.error} Used a basic split instead.`, "error");
		else if (!res.ai)
			toast("No Gemini key: tasks were split without AI. Edit them as needed.");
		onExtracted(res.tasks);
	};
	return (
		<div className="mx-auto flex max-w-[760px] flex-col gap-4">
			<div>
				<h2 className="font-display text-[19px] font-bold">
					Get it all out of your head
				</h2>
				<p className="mt-1 text-[13px] text-muted">
					Talk for a minute about everything on your mind. Unfinished thoughts
					keep pulling at your attention until they're written down somewhere
					you trust.
				</p>
			</div>
			<VoiceDump value={value} onChange={onChange} />
			<div className="flex items-center justify-between">
				<Button tone="quiet" onClick={onSkip}>
					Skip, I'll pick from my inbox
				</Button>
				<Button
					tone="primary"
					disabled={!value.trim() || busy}
					onClick={extract}
				>
					{busy ? (
						<Loader2 size={15} className="animate-spin" />
					) : (
						<Sparkles size={15} />
					)}
					{ai?.gemini ? "Turn into tasks" : "Split into tasks"}
				</Button>
			</div>
		</div>
	);
}

function ReviewStep({
	drafts,
	setDrafts,
	today,
	onBack,
	onNext,
}: {
	drafts: Draft[];
	setDrafts: (d: Draft[]) => void;
	today: string;
	onBack: () => void;
	onNext: () => void;
}) {
	const { data: projects = [] } = useProjects();
	const { data: inbox = [] } = useTasks("inbox");
	const [pull, setPull] = useState<Set<number>>(new Set());
	const [busy, setBusy] = useState(false);
	const patch = (i: number, p: Partial<Draft>) =>
		setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...p } : d)));
	const included = drafts.filter((d) => d.include && d.title.trim());
	const taskDrafts = included.filter((d) => !d.meetingAt);
	const meetings = included.filter((d) => d.meetingAt);
	const topCount = taskDrafts.filter((d) => d.isTop3).length;

	const commit = async () => {
		setBusy(true);
		const ok = await attempt(async () => {
			if (taskDrafts.length) {
				await api.post("/tasks/bulk", {
					tasks: taskDrafts.map(
						({ include: _i, uid: _u, meetingAt: _m, ...t }) => ({
							...t,
							plannedFor: today,
						}),
					),
				});
			}
			// Meetings go straight onto the timeline so they block time.
			if (meetings.length) {
				await api.post(`/day/${today}/blocks`, {
					blocks: meetings.map((m) => ({
						taskId: null,
						projectId: m.projectId,
						title: m.title,
						startMin: hhmmToMin(m.meetingAt!),
						durationMin: m.estimateMin ?? 30,
						kind: "meeting",
					})),
				});
				queryClient.invalidateQueries({ queryKey: ["day"] });
			}
			await Promise.all(
				[...pull].map((id) => api.patch(`/tasks/${id}`, { plannedFor: today })),
			);
			return true;
		});
		setBusy(false);
		if (ok) {
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
			onNext();
		}
	};

	return (
		<div className="mx-auto flex max-w-[860px] flex-col gap-5">
			<div>
				<h2 className="font-display text-[19px] font-bold">Check the list</h2>
				<p className="mt-1 text-[13px] text-muted">
					Nothing is saved until you confirm. Untick anything that isn't for
					today.
				</p>
			</div>

			{drafts.length > 0 && (
				<div className="flex flex-col gap-2">
					<SectionLabel right={<span>{topCount}/3 starred</span>}>
						From your brain dump
					</SectionLabel>
					{drafts.map((d, i) => (
						<div
							key={d.uid}
							className={cx(
								"grid grid-cols-[18px_24px_minmax(0,1fr)_150px_104px_96px] items-center gap-2 rounded-[11px] border border-line bg-surface px-3 py-2",
								!d.include && "opacity-45",
							)}
						>
							<input
								type="checkbox"
								aria-label="Include"
								checked={d.include}
								onChange={(e) => patch(i, { include: e.target.checked })}
								className="size-4 accent-[#eceaf0]"
							/>
							{d.meetingAt ? (
								<span title="Meeting: goes on the timeline">
									<CalendarClock size={15} className="text-muted" />
								</span>
							) : (
								<button
									type="button"
									aria-label="Top 3"
									onClick={() => patch(i, { isTop3: !d.isTop3 })}
									className="cursor-pointer"
								>
									<Star
										size={15}
										className={d.isTop3 ? "fill-warn text-warn" : "text-faint"}
									/>
								</button>
							)}
							<div className="min-w-0">
								<input
									value={d.title}
									onChange={(e) => patch(i, { title: e.target.value })}
									className="w-full bg-transparent text-[13.5px] font-semibold outline-none"
								/>
								{d.nextAction && (
									<div className="truncate font-mono text-[10.5px] text-muted">
										first: {d.nextAction}
									</div>
								)}
							</div>
							<select
								aria-label="Project"
								className={`${inputCls} h-8`}
								value={d.projectId ?? ""}
								onChange={(e) =>
									patch(i, {
										projectId: e.target.value ? Number(e.target.value) : null,
									})
								}
							>
								<option value="">No project</option>
								{projects.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
							{d.meetingAt ? (
								<>
									<input
										aria-label="Meeting time"
										type="time"
										className={`${inputCls} h-8 font-mono`}
										value={d.meetingAt ?? ""}
										onChange={(e) =>
											patch(i, { meetingAt: e.target.value || null })
										}
									/>
									<span className="flex items-center gap-1 font-mono text-[11px] text-muted">
										<input
											aria-label="Meeting length in minutes"
											type="number"
											min={5}
											step={5}
											className={`${inputCls.replace("w-full", "w-16")} h-8 text-right font-mono`}
											value={d.estimateMin ?? 30}
											onChange={(e) =>
												patch(i, { estimateMin: Number(e.target.value) || 30 })
											}
										/>
										min
									</span>
								</>
							) : (
								<>
									<input
										aria-label="Estimate in minutes"
										type="number"
										min={5}
										step={5}
										className={`${inputCls} h-8 text-right font-mono`}
										value={d.estimateMin ?? ""}
										placeholder="min"
										onChange={(e) =>
											patch(i, {
												estimateMin: e.target.value
													? Number(e.target.value)
													: null,
											})
										}
									/>
									<select
										aria-label="Energy"
										className={`${inputCls} h-8`}
										value={d.energy ?? ""}
										onChange={(e) =>
											patch(i, {
												energy: (e.target.value || null) as Energy | null,
											})
										}
									>
										<option value="">energy</option>
										<option value="deep">deep</option>
										<option value="shallow">shallow</option>
										<option value="admin">admin</option>
									</select>
								</>
							)}
						</div>
					))}
				</div>
			)}

			{inbox.length > 0 && (
				<div className="flex flex-col gap-2">
					<SectionLabel right={<span>{pull.size} picked</span>}>
						Pull from your inbox
					</SectionLabel>
					<div className="flex flex-wrap gap-2">
						{inbox.slice(0, 30).map((t) => {
							const on = pull.has(t.id);
							const p = projects.find((x) => x.id === t.projectId);
							return (
								<button
									key={t.id}
									type="button"
									onClick={() => {
										const next = new Set(pull);
										if (on) next.delete(t.id);
										else next.add(t.id);
										setPull(next);
									}}
									className={cx(
										"flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] cursor-pointer",
										on
											? "border-fg bg-raised"
											: "border-line text-muted hover:text-fg",
									)}
								>
									{p && (
										<span
											className="size-2 rounded-full"
											style={{ background: p.color }}
										/>
									)}
									{t.title}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{drafts.length === 0 && inbox.length === 0 && (
				<EmptyState title="Nothing to add">
					Go back and talk it through, or add tasks on the next screen.
				</EmptyState>
			)}

			<div className="flex justify-between">
				<Button tone="quiet" onClick={onBack}>
					Back
				</Button>
				<Button tone="primary" disabled={busy} onClick={commit}>
					{included.length + pull.size > 0
						? `Add ${included.length + pull.size} to today`
						: "Next"}
				</Button>
			</div>
		</div>
	);
}

function PlanStep({ today }: { today: string }) {
	const { data: tasks = [] } = useTasks("today", today);
	const { data: projects = [] } = useProjects();
	const update = useUpdateTask();
	const [intention, setIntention] = useState("");
	const open = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
	const top = open.filter((t) => t.isTop3);

	const begin = async () => {
		const ok = await attempt(() =>
			api.put(`/day/${today}`, {
				startedAt: new Date().toISOString(),
				intention: intention || null,
			}),
		);
		if (ok === undefined) return;
		queryClient.invalidateQueries({ queryKey: ["day"] });
		setUi({
			view: "today",
			startDialog: top[0] ? { taskId: top[0].id } : null,
		});
	};

	return (
		<div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,400px)] gap-6">
			<div className="flex flex-col gap-4">
				<div>
					<h2 className="font-display text-[19px] font-bold">
						Pick three, then give them a time
					</h2>
					<p className="mt-1 text-[13px] text-muted">
						Star the three that would make today a good day. Drag them onto the
						timeline, deep work first.
					</p>
				</div>
				<CapacityBanner date={today} />
				<div className="flex flex-col gap-2">
					{open.map((t) => (
						<div key={t.id} className="flex items-center gap-2">
							<button
								type="button"
								aria-label={t.isTop3 ? "Remove from top 3" : "Add to top 3"}
								onClick={() => {
									if (!t.isTop3 && top.length >= 3) {
										toast("Three is the limit. Unstar one first.");
										return;
									}
									update.mutate({ id: t.id, isTop3: !t.isTop3 });
								}}
								className="cursor-pointer"
							>
								<Star
									size={17}
									className={
										t.isTop3
											? "fill-warn text-warn"
											: "text-faint hover:text-muted"
									}
								/>
							</button>
							<div className="min-w-0 flex-1">
								<TaskRow
									task={t}
									project={projects.find((p) => p.id === t.projectId)}
								/>
							</div>
						</div>
					))}
					{open.length === 0 && <EmptyState title="No tasks for today yet" />}
				</div>
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="day-intention"
						className="text-[12px] font-semibold text-muted"
					>
						Today will be a good day if…
					</label>
					<input
						id="day-intention"
						className={inputCls}
						value={intention}
						onChange={(e) => setIntention(e.target.value)}
						placeholder="the webhook ships"
					/>
				</div>
				<div className="flex justify-end">
					<Button tone="primary" size="lg" onClick={begin}>
						Commit and start the first block
					</Button>
				</div>
			</div>
			<Timeline date={today} tasks={tasks} projects={projects} />
		</div>
	);
}
