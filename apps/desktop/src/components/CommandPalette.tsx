import { Loader2, Search, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
	capture,
	queryClient,
	session,
	useAiStatus,
	useProjects,
	useTasks,
	useToday,
} from "../lib/queries";
import { attempt, setUi, toast, useUi, type View } from "../lib/ui";
import { parseQuickAdd } from "./TaskComposer";
import { cx, Kbd } from "./ui";

interface Action {
	id: string;
	label: ReactNode;
	hint?: string;
	run: () => void | Promise<void>;
}

interface AiCommand {
	action: "start" | "add_task" | "capture" | "navigate" | "answer";
	projectId: number | null;
	taskId: number | null;
	title: string | null;
	minutes: number | null;
	view: string | null;
	answer: string | null;
}

const VIEWS: { v: View; label: string }[] = [
	{ v: "today", label: "Today" },
	{ v: "inbox", label: "Inbox" },
	{ v: "projects", label: "Projects" },
	{ v: "stats", label: "Stats" },
	{ v: "settings", label: "Settings" },
	{ v: "startday", label: "Start my day" },
	{ v: "shutdown", label: "Shutdown" },
];

export function CommandPalette() {
	const open = useUi((s) => s.palette);
	const today = useToday();
	const { data: tasks = [] } = useTasks("today", today);
	const { data: projects = [] } = useProjects();
	const { data: ai } = useAiStatus();
	const [q, setQ] = useState("");
	const [sel, setSel] = useState(0);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (open) {
			setQ("");
			setSel(0);
		}
	}, [open]);

	const close = () => setUi({ palette: false });

	const actions = useMemo<Action[]>(() => {
		const query = q.trim().toLowerCase();
		const list: Action[] = [];
		const openTasks = tasks.filter((t) => t.status === "open");
		for (const t of openTasks) {
			list.push({
				id: `start-${t.id}`,
				label: (
					<>
						Start focus: <b>{t.title}</b>
					</>
				),
				hint: t.isTop3 ? "top 3" : undefined,
				run: () => setUi({ startDialog: { taskId: t.id } }),
			});
		}
		list.push({
			id: "pause",
			label: "Pause / resume session",
			run: () => void attempt(session.toggle),
		});
		list.push({
			id: "end",
			label: "End session",
			run: () => setUi({ endDialog: true }),
		});
		for (const v of VIEWS)
			list.push({
				id: `go-${v.v}`,
				label: `Go to ${v.label}`,
				run: () => setUi({ view: v.v, focusOpen: false }),
			});

		const filtered = query
			? list.filter((a) => {
					const text =
						typeof a.label === "string"
							? a.label
							: a.id.startsWith("start-")
								? `start ${openTasks.find((t) => `start-${t.id}` === a.id)?.title}`
								: a.id;
					return text.toLowerCase().includes(query);
				})
			: list.slice(0, 9);

		if (q.trim()) {
			const parsed = parseQuickAdd(q, projects);
			filtered.push({
				id: "add",
				label: (
					<>
						Add task: <b>{parsed.title || q}</b>
					</>
				),
				hint: "today",
				run: async () => {
					await attempt(() =>
						api.post("/tasks", {
							title: parsed.title || q,
							projectId: parsed.projectId,
							estimateMin: parsed.estimateMin,
							isTop3: parsed.isTop3,
							plannedFor: today,
						}),
					);
					queryClient.invalidateQueries({ queryKey: ["tasks"] });
					toast("Task added");
				},
			});
			filtered.push({
				id: "capture",
				label: (
					<>
						Capture thought: <b>{q}</b>
					</>
				),
				run: async () => {
					await attempt(() => capture(q));
					toast("Captured");
				},
			});
			if (ai?.gemini) {
				filtered.unshift({
					id: "ai",
					label: (
						<span className="flex items-center gap-2">
							<Sparkles size={14} className="text-rose" /> Ask AI: <b>{q}</b>
						</span>
					),
					run: async () => {
						setBusy(true);
						const cmd = await attempt(() =>
							api.post<AiCommand>("/ai/command", { text: q }),
						);
						setBusy(false);
						if (cmd) await runAi(cmd, today);
					},
				});
			}
		}
		return filtered;
	}, [q, tasks, projects, ai?.gemini, today]);

	if (!open) return null;

	const run = async (a: Action | undefined) => {
		if (!a) return;
		await a.run();
		close();
	};

	return (
		<div
			className="fixed inset-0 z-[60] flex justify-center bg-black/50 pt-[12vh]"
			onMouseDown={(e) => e.target === e.currentTarget && close()}
		>
			<div className="animate-pop h-fit w-full max-w-[600px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
				<div className="flex items-center gap-3 border-b border-line px-4">
					{busy ? (
						<Loader2 size={16} className="animate-spin text-muted" />
					) : (
						<Search size={16} className="text-muted" />
					)}
					<input
						autoFocus
						value={q}
						onChange={(e) => {
							setQ(e.target.value);
							setSel(0);
						}}
						onKeyDown={(e) => {
							if (e.key === "Escape") close();
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setSel((s) => Math.min(actions.length - 1, s + 1));
							}
							if (e.key === "ArrowUp") {
								e.preventDefault();
								setSel((s) => Math.max(0, s - 1));
							}
							if (e.key === "Enter") run(actions[sel]);
						}}
						placeholder={
							ai?.gemini
								? "Type a command, a task, or ask: “start 50 min on smp webhook”"
								: "Type a command or a new task…"
						}
						className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
					/>
					<Kbd>Esc</Kbd>
				</div>
				<div className="max-h-[50vh] overflow-y-auto p-1.5">
					{actions.map((a, i) => (
						<button
							key={a.id}
							type="button"
							onMouseEnter={() => setSel(i)}
							onClick={() => run(a)}
							className={cx(
								"flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] cursor-pointer",
								i === sel ? "bg-hover" : "",
							)}
						>
							<span className="truncate">{a.label}</span>
							{a.hint && (
								<span className="text-[11px] text-muted">{a.hint}</span>
							)}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

async function runAi(cmd: AiCommand, today: string) {
	switch (cmd.action) {
		case "start":
			await attempt(() =>
				session.start({
					taskId: cmd.taskId,
					projectId: cmd.projectId,
					mode: cmd.minutes ? "timebox" : undefined,
					minutes: cmd.minutes ?? undefined,
				}),
			);
			setUi({ focusOpen: true });
			break;
		case "add_task":
			await attempt(() =>
				api.post("/tasks", {
					title: cmd.title ?? "New task",
					projectId: cmd.projectId,
					estimateMin: cmd.minutes,
					plannedFor: today,
				}),
			);
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
			toast(`Added: ${cmd.title}`);
			break;
		case "capture":
			await attempt(() => capture(cmd.title ?? ""));
			toast("Captured");
			break;
		case "navigate":
			if (VIEWS.some((v) => v.v === cmd.view))
				setUi({ view: cmd.view as View, focusOpen: false });
			break;
		default:
			toast(cmd.answer ?? "Done");
	}
}
