import type {
	CoachMode,
	CoachServerMessage,
	ExtractedTask,
} from "@deep/shared";
import { Check, Mic, MicOff, PhoneOff, Plus, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { CoachCall } from "../lib/coach";
import { queryClient, useProjects, useTasks, useToday } from "../lib/queries";
import { attempt, setUi, toast, useUi } from "../lib/ui";
import { Button, cx, ProjectChip } from "./ui";

const TITLES: Record<CoachMode, string> = {
	checkin: "Check-in",
	checkout: "Wrap-up",
	plan: "Plan with the coach",
};

interface Line {
	who: "you" | "coach";
	text: string;
}

type Phase = "connecting" | "live" | "ending" | "ended" | "error";

/** The coach's call window. Mounted once in App; opens when ui.coach is set. */
export function CoachPanel() {
	const mode = useUi((s) => s.coach);
	if (!mode) return null;
	return <Call key={mode} mode={mode} />;
}

function Call({ mode }: { mode: CoachMode }) {
	const [phase, setPhase] = useState<Phase>("connecting");
	const [error, setError] = useState<string | null>(null);
	const [lines, setLines] = useState<Line[]>([]);
	const [muted, setMuted] = useState(false);
	const [proposals, setProposals] = useState<ExtractedTask[]>([]);
	const [notes, setNotes] = useState<string[]>([]);
	const callRef = useRef<CoachCall | null>(null);
	const orbRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const close = () => {
		callRef.current?.close();
		setUi({ coach: null });
	};

	useEffect(() => {
		let disposed = false;
		const onMessage = (m: CoachServerMessage) => {
			switch (m.type) {
				case "ready":
					setPhase("live");
					break;
				case "transcript":
					setLines((prev) => {
						const last = prev[prev.length - 1];
						if (last?.who === m.who)
							return [
								...prev.slice(0, -1),
								{ ...last, text: last.text + m.text },
							];
						return [...prev, { who: m.who, text: m.text.trimStart() }];
					});
					break;
				case "action":
					if (m.action === "intention") {
						setNotes((n) => [...n, `Intention saved: ${m.intention}`]);
					} else if (m.action === "wrap_up") {
						setUi({
							coachWrapUp: {
								outcome: m.outcome,
								note: m.note,
								rating: m.rating,
							},
						});
						setNotes((n) => [
							...n,
							"Filled in the wrap-up. Check it and end the session.",
						]);
					} else if (m.action === "tasks") {
						setProposals((p) => {
							const seen = new Set(p.map((t) => t.title.toLowerCase()));
							return [
								...p,
								...m.tasks.filter((t) => !seen.has(t.title.toLowerCase())),
							];
						});
					}
					break;
				case "ended":
					if (m.reason === "error") {
						setError(m.message ?? "The call failed.");
						setPhase("error");
					} else setPhase("ending");
					break;
			}
		};
		const call = new CoachCall(mode, {
			onMessage: (m) => !disposed && onMessage(m),
			onClose: () => {
				if (disposed) return;
				setPhase((p) => (p === "error" ? p : "ending"));
			},
		});
		callRef.current = call;
		call.start().catch((err) => {
			if (disposed) return;
			setError(
				err instanceof DOMException && err.name === "NotAllowedError"
					? "Deep isn't allowed to use the microphone."
					: err instanceof Error
						? err.message
						: String(err),
			);
			setPhase("error");
		});
		return () => {
			disposed = true;
			call.close();
		};
	}, [mode]);

	// Animate the orb from whoever is talking; finish once the last words have played.
	useEffect(() => {
		let raf = 0;
		const tick = () => {
			const call = callRef.current;
			if (call && orbRef.current) {
				const coach = call.coachLevel();
				const level = Math.min(
					1,
					Math.max(coach * 5, muted ? 0 : call.micLevel * 7),
				);
				orbRef.current.style.transform = `scale(${1 + level * 0.35})`;
				orbRef.current.dataset.speaker = coach > 0.02 ? "coach" : "you";
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [muted]);

	useEffect(() => {
		if (phase !== "ending") return;
		const t = setInterval(() => {
			if ((callRef.current?.pendingAudioSec() ?? 0) <= 0.05) {
				clearInterval(t);
				setPhase("ended");
				callRef.current?.close();
				// A check-in or wrap-up just closes; a plan stays open for its suggestions.
				if (mode !== "plan") setTimeout(() => setUi({ coach: null }), 1600);
			}
		}, 200);
		return () => clearInterval(t);
	}, [phase, mode]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new lines
	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [lines, notes]);

	const status =
		phase === "connecting"
			? "Connecting…"
			: phase === "live"
				? muted
					? "Muted"
					: "Listening. Just talk."
				: phase === "error"
					? "Call failed"
					: "Call ended";

	return (
		<div className="animate-pop fixed right-5 bottom-5 z-[60] flex max-h-[min(560px,calc(100vh-40px))] w-[380px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
			<div className="flex items-center gap-3 border-b border-line px-4 py-3">
				<div className="relative grid size-9 place-items-center">
					<div
						ref={orbRef}
						data-speaker="you"
						className={cx(
							"size-7 rounded-full transition-transform duration-75",
							"bg-[radial-gradient(circle_at_35%_35%,#b7adff,#6b5cf0_55%,#3a2f9e)] data-[speaker=you]:bg-[radial-gradient(circle_at_35%_35%,#d9d6e3,#8f8a98_60%,#4a4653)]",
							phase === "connecting" && "animate-breathe",
							(phase === "ended" || phase === "error") && "opacity-40",
						)}
					/>
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[13.5px] font-semibold">{TITLES[mode]}</div>
					<div className="text-[11.5px] text-muted">{status}</div>
				</div>
				{phase === "live" && (
					<button
						type="button"
						aria-label={muted ? "Unmute" : "Mute"}
						title={muted ? "Unmute" : "Mute"}
						onClick={() => {
							callRef.current?.setMuted(!muted);
							setMuted(!muted);
						}}
						className={cx(
							"grid size-8 place-items-center rounded-full cursor-pointer",
							muted
								? "bg-warn-bg text-warn"
								: "bg-raised text-fg hover:bg-hover",
						)}
					>
						{muted ? <MicOff size={14} /> : <Mic size={14} />}
					</button>
				)}
				<button
					type="button"
					aria-label={
						phase === "live" || phase === "connecting" ? "End call" : "Close"
					}
					title={
						phase === "live" || phase === "connecting" ? "End call" : "Close"
					}
					onClick={close}
					className={cx(
						"grid size-8 place-items-center rounded-full cursor-pointer",
						phase === "live" || phase === "connecting"
							? "bg-rose text-white hover:brightness-110"
							: "bg-raised text-fg hover:bg-hover",
					)}
				>
					<PhoneOff size={14} />
				</button>
			</div>

			<div
				ref={scrollRef}
				className="flex min-h-[90px] flex-col gap-2 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed"
			>
				{lines.length === 0 && phase !== "error" && (
					<div className="text-muted">
						{mode === "checkin"
							? "The coach will ask what you're about to do."
							: mode === "checkout"
								? "Tell the coach how it went and where you stopped."
								: "Talk through today. Suggested tasks appear below for you to add."}
					</div>
				)}
				{lines.map((l, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: lines only grow
						key={i}
						className={cx(l.who === "you" ? "text-muted" : "text-fg")}
					>
						<span className="mr-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">
							{l.who === "you" ? "You" : "Coach"}
						</span>
						{l.text}
					</div>
				))}
				{notes.map((n) => (
					<div
						key={n}
						className="flex items-center gap-2 rounded-lg bg-raised px-2.5 py-1.5 text-[12px] text-good"
					>
						<Check size={13} /> {n}
					</div>
				))}
				{error && (
					<div className="rounded-lg bg-[#2a1517] px-2.5 py-2 text-[12.5px] text-[#f6b3b3]">
						{error}
					</div>
				)}
			</div>

			{proposals.length > 0 && (
				<Proposals
					tasks={proposals}
					onDone={() => {
						setProposals([]);
						if (phase === "ended" || phase === "error") close();
					}}
				/>
			)}
		</div>
	);
}

/** Tasks the coach suggested; nothing is saved until you add them. */
function Proposals({
	tasks,
	onDone,
}: {
	tasks: ExtractedTask[];
	onDone: () => void;
}) {
	const today = useToday();
	const { data: projects = [] } = useProjects();
	const { data: inbox = [] } = useTasks("inbox");
	const [skip, setSkip] = useState<Set<number>>(new Set());
	const [busy, setBusy] = useState(false);
	const picked = tasks.filter((_, i) => !skip.has(i));

	const add = async () => {
		setBusy(true);
		const ok = await attempt(async () => {
			// Inbox tasks with the same title are moved to today rather than duplicated.
			const fromInbox = new Map(inbox.map((t) => [t.title.toLowerCase(), t]));
			const moves = picked.filter((t) => fromInbox.has(t.title.toLowerCase()));
			const fresh = picked.filter((t) => !fromInbox.has(t.title.toLowerCase()));
			await Promise.all(
				moves.map((t) =>
					api.patch(`/tasks/${fromInbox.get(t.title.toLowerCase())!.id}`, {
						plannedFor: today,
						isTop3: t.isTop3,
					}),
				),
			);
			if (fresh.length)
				await api.post("/tasks/bulk", {
					tasks: fresh.map(({ meetingAt: _m, ...t }) => ({
						...t,
						plannedFor: today,
					})),
				});
			return true;
		});
		setBusy(false);
		if (ok) {
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
			toast(
				`Added ${picked.length} task${picked.length === 1 ? "" : "s"} to today`,
			);
			onDone();
		}
	};

	return (
		<div className="border-t border-line bg-bg/40 px-4 py-3">
			<div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
				Suggested for today
			</div>
			<div className="flex max-h-[180px] flex-col gap-1 overflow-y-auto">
				{tasks.map((t, i) => {
					const on = !skip.has(i);
					const project = projects.find((p) => p.id === t.projectId);
					return (
						<label
							key={t.title}
							className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] hover:bg-raised"
						>
							<input
								type="checkbox"
								checked={on}
								onChange={() => {
									const next = new Set(skip);
									on ? next.add(i) : next.delete(i);
									setSkip(next);
								}}
								className="accent-[#eceaf0]"
							/>
							{t.isTop3 && (
								<Star size={11} className="shrink-0 fill-warn text-warn" />
							)}
							<span
								className={cx(
									"min-w-0 flex-1 truncate",
									!on && "text-faint line-through",
								)}
							>
								{t.title}
							</span>
							{project && <ProjectChip project={project} />}
							{t.estimateMin && (
								<span className="font-mono text-[10.5px] text-faint">
									{t.estimateMin}m
								</span>
							)}
						</label>
					);
				})}
			</div>
			<div className="mt-2 flex justify-end gap-2">
				<Button size="sm" tone="quiet" onClick={onDone}>
					Dismiss
				</Button>
				<Button
					size="sm"
					tone="primary"
					onClick={add}
					disabled={busy || picked.length === 0}
				>
					<Plus size={12} /> Add {picked.length} to today
				</Button>
			</div>
		</div>
	);
}
