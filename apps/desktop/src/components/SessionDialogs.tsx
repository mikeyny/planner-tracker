import {
	formatMinutes,
	type SessionOutcome,
	TIMER_MODE_ORDER,
	TIMER_MODES,
	type TimerMode,
} from "@deep/shared";
import {
	Ban,
	Check,
	Coffee,
	Inbox,
	Sun,
	Trash2,
	TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useLiveState } from "../lib/live";
import {
	queryClient,
	session,
	useCaptures,
	useProjects,
	useSettings,
	useTasks,
	useToday,
} from "../lib/queries";
import { attempt, setUi, useUi } from "../lib/ui";
import { Button, cx, inputCls, Kbd, Modal, ProjectChip, Segmented } from "./ui";

/** Last focused task, so "back to work" after a break is one click. */
let lastFocus: { taskId: number | null; projectId: number | null } | null =
	null;
export function rememberFocus(v: typeof lastFocus) {
	lastFocus = v;
}
export function lastFocusTarget() {
	return lastFocus;
}

export function StartSessionDialog() {
	const target = useUi((s) => s.startDialog);
	const { data: settings } = useSettings();
	const { data: projects = [] } = useProjects();
	const today = useToday();
	const { data: todayTasks = [] } = useTasks("today", today);
	const { data: allOpen = [] } = useTasks("open");
	const [mode, setMode] = useState<TimerMode>("deep50");
	const [minutes, setMinutes] = useState(60);
	const [intention, setIntention] = useState("");
	const [projectId, setProjectId] = useState<number | null>(null);
	const [taskId, setTaskId] = useState<number | null>(null);

	// Read without re-running the reset effect on every refetch.
	const todayRef = useRef(todayTasks);
	todayRef.current = todayTasks;

	const task = useMemo(
		() => [...todayTasks, ...allOpen].find((t) => t.id === taskId) ?? null,
		[todayTasks, allOpen, taskId],
	);

	useEffect(() => {
		if (!target) return;
		setMode(settings?.defaultMode ?? "deep50");
		setMinutes(settings?.timeboxMin ?? 60);
		setIntention("");
		// Opened without a target (S key, sidebar): default to the first big rock.
		const firstRock = todayRef.current.find(
			(t) => t.status === "open" && t.isTop3,
		);
		setTaskId(
			target.taskId ?? (target.projectId ? null : (firstRock?.id ?? null)),
		);
		setProjectId(target.projectId ?? null);
	}, [target, settings]);

	useEffect(() => {
		if (task) setProjectId(task.projectId);
	}, [task]);

	const close = () => setUi({ startDialog: null });
	const start = async () => {
		const ok = await attempt(() =>
			session.start({
				taskId,
				projectId,
				mode,
				minutes: mode === "timebox" ? minutes : undefined,
				intention: intention || null,
			}),
		);
		if (ok !== undefined) {
			rememberFocus({ taskId, projectId });
			setUi({ startDialog: null, focusOpen: true });
		}
	};

	const project = projects.find((p) => p.id === projectId);
	const leftOff = project?.leftOffNote;
	const pickable = todayTasks.filter((t) => t.status === "open");

	return (
		<Modal
			open={!!target}
			onClose={close}
			title="Start a focus session"
			width={560}
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					start();
				}}
			>
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="start-task"
						className="text-[12px] font-semibold text-muted"
					>
						Task
					</label>
					<select
						id="start-task"
						className={inputCls}
						value={taskId ?? ""}
						onChange={(e) =>
							setTaskId(e.target.value ? Number(e.target.value) : null)
						}
					>
						<option value="">No specific task</option>
						{task && !pickable.some((t) => t.id === task.id) && (
							<option value={task.id}>{task.title}</option>
						)}
						{pickable.map((t) => (
							<option key={t.id} value={t.id}>
								{t.isTop3 ? "★ " : ""}
								{t.title}
							</option>
						))}
					</select>
				</div>

				{!taskId && (
					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="start-project"
							className="text-[12px] font-semibold text-muted"
						>
							Project
						</label>
						<select
							id="start-project"
							className={inputCls}
							value={projectId ?? ""}
							onChange={(e) =>
								setProjectId(e.target.value ? Number(e.target.value) : null)
							}
						>
							<option value="">No project</option>
							{projects.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					</div>
				)}

				{leftOff && (
					<div className="rounded-[11px] border border-line bg-bg px-3.5 py-2.5 text-[12.5px]">
						<div className="mb-0.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
							Where you left off <ProjectChip project={project} />
						</div>
						{leftOff}
					</div>
				)}

				<div className="flex flex-col gap-1.5">
					<span className="text-[12px] font-semibold text-muted">Timer</span>
					<Segmented
						value={mode}
						onChange={setMode}
						options={TIMER_MODE_ORDER.map((m) => ({
							value: m,
							label: TIMER_MODES[m].short.includes("/")
								? `${TIMER_MODES[m].label} ${TIMER_MODES[m].short}`
								: TIMER_MODES[m].label,
							title: TIMER_MODES[m].hint,
						}))}
					/>
					<div className="flex items-center gap-2 text-[12px] text-muted">
						{TIMER_MODES[mode].hint}
						{mode === "timebox" && (
							<span className="ml-auto flex items-center gap-2">
								<input
									aria-label="Minutes"
									type="number"
									min={5}
									max={480}
									step={5}
									value={minutes}
									onChange={(e) => setMinutes(Number(e.target.value) || 60)}
									className={`${inputCls} h-8 w-20 text-right font-mono`}
								/>
								min
							</span>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="start-intention"
						className="text-[12px] font-semibold text-muted"
					>
						In this session I will…
					</label>
					<input
						id="start-intention"
						autoFocus
						className={inputCls}
						placeholder={task?.nextAction ?? "get the signature test passing"}
						value={intention}
						onChange={(e) => setIntention(e.target.value)}
					/>
				</div>

				<div className="flex items-center justify-between">
					<span className="text-[11.5px] text-faint">
						<Kbd>Enter</Kbd> to start
					</span>
					<div className="flex gap-2">
						<Button tone="quiet" onClick={close}>
							Cancel
						</Button>
						<Button tone="primary" type="submit">
							Start{" "}
							{mode === "timebox"
								? `${minutes} min`
								: TIMER_MODES[mode].workMin
									? `${TIMER_MODES[mode].workMin} min`
									: "Flowtime"}
						</Button>
					</div>
				</div>
			</form>
		</Modal>
	);
}

export function EndSessionDialog() {
	const open = useUi((s) => s.endDialog);
	const state = useLiveState();
	const s = state?.session;
	const [outcome, setOutcome] = useState<SessionOutcome>("progress");
	const [note, setNote] = useState("");
	const [rating, setRating] = useState<number | null>(null);

	useEffect(() => {
		if (open) {
			setOutcome("progress");
			setNote("");
			setRating(null);
		}
	}, [open]);

	const close = () => setUi({ endDialog: false });
	const finish = async () => {
		const res = await attempt(() =>
			session.stop({ outcome, leftOffNote: note || null, focusRating: rating }),
		);
		if (!res) return;
		setUi({
			endDialog: false,
			focusOpen: false,
			breakOffer: res.breakMin > 0 ? res.breakMin : null,
		});
	};

	const outcomes: {
		v: SessionOutcome;
		label: string;
		icon: React.ReactNode;
	}[] = [
		{
			v: "done",
			label: s?.task ? "Task done" : "Done",
			icon: <Check size={15} />,
		},
		{ v: "progress", label: "Made progress", icon: <TrendingUp size={15} /> },
		{ v: "blocked", label: "Blocked", icon: <Ban size={15} /> },
	];

	return (
		<Modal
			open={open && !!s && s.kind === "focus"}
			onClose={close}
			title="End session"
			width={500}
		>
			<div className="flex flex-col gap-4">
				{s?.task && (
					<div className="text-[13.5px] font-semibold">{s.task.title}</div>
				)}
				<div className="grid grid-cols-3 gap-2">
					{outcomes.map((o) => (
						<button
							key={o.v}
							type="button"
							onClick={() => setOutcome(o.v)}
							className={cx(
								"flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-[12.5px] font-semibold cursor-pointer",
								outcome === o.v
									? "border-fg bg-raised"
									: "border-line text-muted hover:text-fg",
							)}
						>
							{o.icon}
							{o.label}
						</button>
					))}
				</div>
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="end-note"
						className="text-[12px] font-semibold text-muted"
					>
						Where I left off{" "}
						<span className="font-normal text-faint">
							(shown next time you open this project)
						</span>
					</label>
					<textarea
						id="end-note"
						autoFocus
						rows={3}
						value={note}
						onChange={(e) => setNote(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) finish();
						}}
						placeholder="Signature now built from raw body. Next: test with the sandbox payload."
						className={`${inputCls} h-auto py-2 leading-relaxed`}
					/>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-[12px] font-semibold text-muted">
						Focus quality
					</span>
					<div className="flex gap-1">
						{[1, 2, 3, 4, 5].map((n) => (
							<button
								key={n}
								type="button"
								aria-label={`Focus ${n} of 5`}
								onClick={() => setRating(rating === n ? null : n)}
								className={cx(
									"size-7 rounded-lg border font-mono text-[12px] cursor-pointer",
									rating !== null && n <= rating
										? "border-fg bg-fg text-bg"
										: "border-line text-muted",
								)}
							>
								{n}
							</button>
						))}
					</div>
				</div>
				<div className="flex justify-end gap-2">
					<Button tone="quiet" onClick={close}>
						Keep going
					</Button>
					<Button tone="primary" onClick={finish}>
						End session
					</Button>
				</div>
			</div>
		</Modal>
	);
}

/** After a focus session: offer a break and empty the parking lot. */
export function BreakOffer() {
	const minutes = useUi((s) => s.breakOffer);
	const { data: caps = [] } = useCaptures("open");
	const today = useToday();
	const close = () => setUi({ breakOffer: null });

	const triage = async (id: number, action: "inbox" | "today" | "delete") => {
		await attempt(() => api.patch(`/captures/${id}`, { action, date: today }));
		queryClient.invalidateQueries({ queryKey: ["captures"] });
	};

	return (
		<Modal
			open={minutes !== null}
			onClose={close}
			title="Nice work. Take a break?"
			width={520}
		>
			<div className="flex flex-col gap-4">
				<p className="text-[13px] text-muted">
					A real break restores focus: stand up, refill water, look at something
					far away. Screens don't count.
				</p>
				{caps.length > 0 && (
					<div className="flex flex-col gap-2">
						<div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
							Parking lot · {caps.length}
						</div>
						{caps.map((c) => (
							<div
								key={c.id}
								className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-[13px]"
							>
								<span className="min-w-0 flex-1 truncate">{c.text}</span>
								<button
									type="button"
									title="Do today"
									onClick={() => triage(c.id, "today")}
									className="text-muted hover:text-fg cursor-pointer"
								>
									<Sun size={14} />
								</button>
								<button
									type="button"
									title="Send to inbox"
									onClick={() => triage(c.id, "inbox")}
									className="text-muted hover:text-fg cursor-pointer"
								>
									<Inbox size={14} />
								</button>
								<button
									type="button"
									title="Delete"
									onClick={() => triage(c.id, "delete")}
									className="text-muted hover:text-fg cursor-pointer"
								>
									<Trash2 size={14} />
								</button>
							</div>
						))}
					</div>
				)}
				<div className="flex justify-end gap-2">
					<Button tone="quiet" onClick={close}>
						Skip break
					</Button>
					<Button
						tone="primary"
						onClick={async () => {
							const m = minutes ?? 5;
							close();
							const ok = await attempt(() => session.startBreak(m));
							if (ok !== undefined) setUi({ focusOpen: true });
						}}
					>
						<Coffee size={15} /> Start {minutes} min break
					</Button>
				</div>
			</div>
		</Modal>
	);
}

export function IdleReturnDialog() {
	const state = useLiveState();
	const idle = state?.idleReturn;
	const choose = (a: "keep" | "break" | "discard" | "end") =>
		attempt(() => session.resolveIdle(a));
	const options: {
		a: "keep" | "break" | "discard" | "end";
		title: string;
		desc: string;
	}[] = [
		{ a: "keep", title: "Keep", desc: "I was thinking or sketching" },
		{ a: "break", title: "Count as break", desc: "Doesn't add to focus time" },
		{ a: "discard", title: "Discard", desc: "Remove it from the log" },
	];
	if (idle?.canEnd)
		options.push({
			a: "end",
			title: "End session",
			desc: "Close it at the moment I left",
		});
	return (
		<Modal open={!!idle} onClose={() => choose("break")} width={520}>
			<div className="flex flex-col gap-4">
				<div>
					<div className="font-display text-[19px] font-bold">
						You were away for{" "}
						<span className="font-mono">
							{formatMinutes((idle?.awaySec ?? 0) / 60)}
						</span>
					</div>
					<div className="mt-1 text-[13px] text-muted">
						No keyboard or mouse input since{" "}
						{idle
							? new Date(idle.pausedAt).toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								})
							: ""}
						. The session paused itself.
					</div>
				</div>
				<div
					className={cx(
						"grid gap-2",
						options.length === 4 ? "grid-cols-2" : "grid-cols-3",
					)}
				>
					{options.map((o) => (
						<button
							key={o.a}
							type="button"
							onClick={() => choose(o.a)}
							className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5 text-left hover:border-fg cursor-pointer"
						>
							<b className="text-[13px]">{o.title}</b>
							<span className="text-[11.5px] text-muted">{o.desc}</span>
						</button>
					))}
				</div>
			</div>
		</Modal>
	);
}
