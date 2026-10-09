import { formatMinutes, type WeeklyReviewData } from "@deep/shared";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Button,
	cx,
	inputCls,
	ProjectDot,
	SectionLabel,
} from "../components/ui";
import { api } from "../lib/api";
import {
	queryClient,
	useAiStatus,
	useHeatmap,
	useProjects,
	useReviewPending,
	useWeeklyReview,
	useWeekStats,
} from "../lib/queries";
import { attempt, setUi, toast } from "../lib/ui";
import { DailyBars, ProjectTargets, Tile, weekLabel } from "./Week";

type Step = "week" | "reflect" | "summary" | "budgets" | "done";

const STEPS: { id: Step; label: string }[] = [
	{ id: "week", label: "Last week" },
	{ id: "reflect", label: "Reflect" },
	{ id: "summary", label: "Summary" },
	{ id: "budgets", label: "Next week" },
];

/** Monday ritual: look back at last week, then set next week's project budgets. */
export function ReviewView() {
	const { data: pending } = useReviewPending();
	const start = pending?.start;
	return (
		<div className="flex h-full min-h-0 flex-col gap-5">
			{start ? (
				<ReviewFlow start={start} alreadyDone={!!pending?.done} />
			) : null}
		</div>
	);
}

function ReviewFlow({
	start,
	alreadyDone,
}: {
	start: string;
	alreadyDone: boolean;
}) {
	const [step, setStep] = useState<Step>("week");
	const { data: review } = useWeeklyReview(start);
	const [form, setForm] = useState<WeeklyReviewData>({});
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		if (review && !loaded) {
			setForm(review.data);
			setLoaded(true);
		}
	}, [review, loaded]);

	const save = (data: WeeklyReviewData) =>
		attempt(async () => {
			await api.put(`/reviews/weekly/${start}`, { data });
			queryClient.invalidateQueries({ queryKey: ["reviews"] });
			return true;
		});

	return (
		<>
			<header className="flex flex-wrap items-center gap-4">
				<Button tone="quiet" size="sm" onClick={() => setUi({ view: "today" })}>
					<ArrowLeft size={14} /> Today
				</Button>
				<h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">
					Weekly review{" "}
					<span className="font-mono text-[15px] font-normal text-muted">
						{weekLabel(start)}
					</span>
				</h1>
				{step !== "done" && (
					<ol className="ml-auto flex items-center gap-1.5">
						{STEPS.map((s, i) => (
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
				)}
			</header>

			{alreadyDone && step === "week" && (
				<div className="rounded-[11px] border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-muted">
					You already reviewed this week. Going through it again updates your
					answers and budgets.
				</div>
			)}

			<div className="min-h-0 flex-1 overflow-y-auto pb-10">
				{step === "week" && (
					<WeekStep start={start} onNext={() => setStep("reflect")} />
				)}
				{step === "reflect" && (
					<ReflectStep
						form={form}
						setForm={setForm}
						onBack={() => setStep("week")}
						onNext={async () => {
							if (await save(form)) setStep("summary");
						}}
					/>
				)}
				{step === "summary" && (
					<SummaryStep
						start={start}
						existing={review?.aiSummary ?? null}
						onBack={() => setStep("reflect")}
						onNext={() => setStep("budgets")}
					/>
				)}
				{step === "budgets" && (
					<BudgetsStep
						start={start}
						form={form}
						setForm={setForm}
						onBack={() => setStep("summary")}
						onDone={async () => {
							if (!(await save(form))) return;
							const ok = await attempt(() =>
								api.post(`/reviews/weekly/${start}/complete`),
							);
							if (ok === undefined) return;
							queryClient.invalidateQueries({ queryKey: ["reviews"] });
							queryClient.invalidateQueries({ queryKey: ["projects"] });
							queryClient.invalidateQueries({ queryKey: ["stats"] });
							setStep("done");
						}}
					/>
				)}
				{step === "done" && <DoneStep />}
			</div>
		</>
	);
}

function WeekStep({ start, onNext }: { start: string; onNext: () => void }) {
	const { data: w } = useWeekStats(start);
	const { data: heat } = useHeatmap(4);
	if (!w) return null;
	const pct = Math.round((w.focusSec / Math.max(1, w.targetSec)) * 100);
	return (
		<div className="mx-auto flex max-w-[960px] flex-col gap-5">
			<div className="grid grid-cols-4 gap-3">
				<Tile
					label="Focused"
					value={formatMinutes(w.focusSec / 60)}
					sub={`${pct}% of target`}
				/>
				<Tile label="Days on target" value={`${w.daysOnTarget}/5`} />
				<Tile label="Tasks done" value={String(w.tasksDone)} />
				<Tile
					label="Pulled away"
					value={String(w.urges + w.interruptions)}
					sub={
						w.topDistractions[0]
							? `mostly ${w.topDistractions[0].text}`
							: undefined
					}
				/>
			</div>
			<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
				<SectionLabel>Focus by day</SectionLabel>
				<DailyBars w={w} />
			</section>
			<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
				<SectionLabel>Projects vs weekly targets</SectionLabel>
				<ProjectTargets w={w} />
			</section>
			{heat && heat.bestHours.length > 0 && (
				<p className="text-[13px] text-muted">
					Over the last 4 weeks you focused most at{" "}
					<b className="font-mono text-fg">
						{heat.bestHours.map((h) => `${h}:00`).join(", ")}
					</b>
					. Protect those hours for deep work.
				</p>
			)}
			<div className="flex justify-end">
				<Button tone="primary" onClick={onNext}>
					Next
				</Button>
			</div>
		</div>
	);
}

function ReflectStep({
	form,
	setForm,
	onBack,
	onNext,
}: {
	form: WeeklyReviewData;
	setForm: (f: WeeklyReviewData) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	const field = (
		key: "wentWell" | "change" | "focusNext",
		label: string,
		placeholder: string,
	) => (
		<label className="flex flex-col gap-1.5 text-[12px] font-semibold text-muted">
			{label}
			<textarea
				rows={3}
				value={form[key] ?? ""}
				onChange={(e) => setForm({ ...form, [key]: e.target.value })}
				placeholder={placeholder}
				className={`${inputCls} h-auto py-2 leading-relaxed`}
			/>
		</label>
	);
	return (
		<div className="mx-auto flex max-w-[720px] flex-col gap-4">
			<p className="text-[13px] text-muted">
				Two minutes, honestly. Nobody else reads this.
			</p>
			{field(
				"wentWell",
				"What went well?",
				"Mornings stayed protected; the webhook shipped.",
			)}
			{field(
				"change",
				"What would you change?",
				"Phone in another room after lunch.",
			)}
			{field(
				"focusNext",
				"What matters most next week?",
				"Launch the Cloudlyte landing page.",
			)}
			<div className="flex justify-between">
				<Button tone="quiet" onClick={onBack}>
					Back
				</Button>
				<Button tone="primary" onClick={onNext}>
					Next
				</Button>
			</div>
		</div>
	);
}

function SummaryStep({
	start,
	existing,
	onBack,
	onNext,
}: {
	start: string;
	existing: string | null;
	onBack: () => void;
	onNext: () => void;
}) {
	const { data: ai } = useAiStatus();
	const [summary, setSummary] = useState<string | null>(existing);
	const [nextFocus, setNextFocus] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const generate = async () => {
		setBusy(true);
		const res = await attempt(() =>
			api.post<{
				summary: string;
				nextFocus: string | null;
				warning: string | null;
			}>(`/reviews/weekly/${start}/summary`),
		);
		setBusy(false);
		if (res) {
			setSummary(res.summary);
			setNextFocus(res.nextFocus);
			if (res.warning)
				toast(
					`Gemini is unavailable right now, so this summary is from your numbers. Try Rewrite later. (${res.warning})`,
					"error",
				);
			queryClient.invalidateQueries({ queryKey: ["reviews"] });
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: generate once on arrival when there's no summary yet
	useEffect(() => {
		if (!existing) generate();
	}, []);

	return (
		<div className="mx-auto flex max-w-[720px] flex-col gap-4">
			<section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-5">
				<SectionLabel
					right={
						<Button size="sm" tone="quiet" onClick={generate} disabled={busy}>
							{busy ? (
								<Loader2 size={13} className="animate-spin" />
							) : (
								<Sparkles size={13} />
							)}
							{summary ? "Rewrite" : "Summarise"}
						</Button>
					}
				>
					{ai?.gemini ? "Your week, summarised" : "Your week"}
				</SectionLabel>
				{busy && !summary ? (
					<div className="flex items-center gap-2 py-4 text-muted">
						<Loader2 size={15} className="animate-spin" /> Reading your week…
					</div>
				) : (
					<p className="text-[15px] leading-relaxed">{summary}</p>
				)}
				{nextFocus && (
					<p className="border-t border-line pt-3 text-[13px] text-muted">
						<span className="font-semibold text-fg">Next week: </span>
						{nextFocus}
					</p>
				)}
			</section>
			<div className="flex justify-between">
				<Button tone="quiet" onClick={onBack}>
					Back
				</Button>
				<Button tone="primary" onClick={onNext} disabled={busy && !summary}>
					Next
				</Button>
			</div>
		</div>
	);
}

/** Matches the API's limit; nobody budgets more than this for one project. */
const MAX_HOURS = 100;

function BudgetsStep({
	start,
	form,
	setForm,
	onBack,
	onDone,
}: {
	start: string;
	form: WeeklyReviewData;
	setForm: (f: WeeklyReviewData) => void;
	onBack: () => void;
	onDone: () => void;
}) {
	const { data: projects = [] } = useProjects();
	const { data: w } = useWeekStats(start);
	const [busy, setBusy] = useState(false);
	const active = projects.filter((p) => p.status === "active");
	const spent = (id: number) =>
		(w?.perProject.find((p) => p.projectId === id)?.sec ?? 0) / 3600;
	// What's typed stays as typed ("7." on the way to "7.5"); the minutes are derived from it.
	const [drafts, setDrafts] = useState<Record<number, string>>({});
	const hoursFor = (id: number, fallback: number | null) => {
		if (drafts[id] !== undefined) return drafts[id]!;
		const v = form.budgets?.[String(id)];
		const min = v ?? fallback ?? 0;
		return min ? String(Math.round((min / 60) * 10) / 10) : "";
	};
	const setHours = (id: number, hours: string) => {
		setDrafts({ ...drafts, [id]: hours });
		const n = Number(hours);
		const minutes =
			Number.isFinite(n) && n > 0 ? Math.round(Math.min(n, MAX_HOURS) * 60) : 0;
		setForm({ ...form, budgets: { ...form.budgets, [String(id)]: minutes } });
	};
	const tooBig = active.some(
		(p) => Number(hoursFor(p.id, p.weeklyTargetMin)) > MAX_HOURS,
	);
	const total = active.reduce(
		(a, p) => a + Number(hoursFor(p.id, p.weeklyTargetMin) || 0),
		0,
	);

	return (
		<div className="mx-auto flex max-w-[720px] flex-col gap-4">
			<p className="text-[13px] text-muted">
				Give each project a weekly budget. The weekly dashboard tracks against
				these, and you'll see them here next Monday.
			</p>
			<div className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
				{active.map((p) => (
					<div key={p.id} className="flex items-center gap-3 px-4 py-3">
						<ProjectDot color={p.color} size={10} />
						<span className="flex-1 text-[14px] font-semibold">{p.name}</span>
						<span className="text-[12px] text-muted">
							last week {spent(p.id).toFixed(1)}h
						</span>
						<label className="flex items-center gap-2 text-[12px] text-muted">
							<input
								aria-label={`${p.name} hours per week`}
								type="number"
								min={0}
								step={0.5}
								value={hoursFor(p.id, p.weeklyTargetMin)}
								onChange={(e) => setHours(p.id, e.target.value)}
								className={`${inputCls.replace("w-full", "w-20")} text-right font-mono`}
								placeholder="0"
							/>
							h / week
						</label>
					</div>
				))}
				{active.length === 0 && (
					<div className="px-4 py-6 text-center text-[13px] text-muted">
						No active projects.
					</div>
				)}
			</div>
			<div className="flex items-center justify-between text-[12px]">
				<span className="text-warn">
					{tooBig ? `A budget can be at most ${MAX_HOURS}h a week.` : ""}
				</span>
				<span className="font-mono text-muted">
					total {total.toFixed(1)}h / week
				</span>
			</div>
			<div className="flex justify-between">
				<Button tone="quiet" onClick={onBack}>
					Back
				</Button>
				<Button
					tone="primary"
					disabled={busy || tooBig}
					onClick={async () => {
						setBusy(true);
						await onDone();
						setBusy(false);
					}}
				>
					<Check size={15} /> Finish review
				</Button>
			</div>
		</div>
	);
}

function DoneStep() {
	return (
		<div className="grid h-full place-items-center pt-16">
			<div className="flex max-w-[460px] flex-col items-center gap-4 text-center">
				<div className="grid size-16 place-items-center rounded-full bg-[#12261a] text-[#9fe3a9]">
					<Check size={30} strokeWidth={3} />
				</div>
				<h2 className="font-display text-[26px] font-extrabold tracking-[-0.02em]">
					Week reviewed
				</h2>
				<p className="text-[14px] text-muted">
					Budgets are set. A fresh week starts now.
				</p>
				<div className="flex gap-2">
					<Button onClick={() => setUi({ view: "stats" })}>
						Open the week dashboard
					</Button>
					<Button tone="primary" onClick={() => setUi({ view: "startday" })}>
						Start my day
					</Button>
				</div>
			</div>
		</div>
	);
}
