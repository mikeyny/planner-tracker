import { formatMinutes, type Project, type Task } from "@deep/shared";
import {
	ArrowRight,
	Check,
	Inbox,
	MoreHorizontal,
	Play,
	Scissors,
	Star,
	Sun,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	tomorrowOf,
	useDeleteTask,
	useToday,
	useUpdateTask,
} from "../lib/queries";
import { attempt, setUi } from "../lib/ui";
import { cx, IconButton, ProjectChip } from "./ui";

export function TaskRow({
	task,
	project,
	onSplit,
	compact,
	draggable = true,
}: {
	task: Task;
	project?: Project | null;
	onSplit?: (task: Task) => void;
	compact?: boolean;
	draggable?: boolean;
}) {
	const update = useUpdateTask();
	const del = useDeleteTask();
	const today = useToday();
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState(task.title);
	const [menu, setMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const done = task.status === "done";

	useEffect(() => setTitle(task.title), [task.title]);
	useEffect(() => {
		if (!menu) return;
		const close = (e: MouseEvent) => {
			if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
		};
		window.addEventListener("mousedown", close);
		return () => window.removeEventListener("mousedown", close);
	}, [menu]);

	const saveTitle = () => {
		setEditing(false);
		const t = title.trim();
		if (t && t !== task.title) update.mutate({ id: task.id, title: t });
		else setTitle(task.title);
	};

	const spentMin = Math.round(task.spentSec / 60);

	return (
		<div
			draggable={draggable && !editing && !done}
			onDragStart={(e) => {
				e.dataTransfer.setData("text/deep-task", String(task.id));
				e.dataTransfer.effectAllowed = "copyMove";
			}}
			className={cx(
				"group relative grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 rounded-[11px] border border-line bg-surface px-3 transition-colors hover:border-line-strong",
				compact ? "py-2" : "py-2.5",
				done && "opacity-55",
			)}
		>
			<button
				type="button"
				aria-label={done ? "Mark as not done" : "Mark as done"}
				onClick={() =>
					update.mutate({ id: task.id, status: done ? "open" : "done" })
				}
				className={cx(
					"mt-0.5 grid size-[18px] place-items-center rounded-[5px] border-[1.5px] transition-colors cursor-pointer",
					done
						? "border-fg bg-fg text-bg"
						: "border-line-strong hover:border-muted",
				)}
			>
				{done && <Check size={12} strokeWidth={3.5} />}
			</button>

			<div className="min-w-0">
				{editing ? (
					<input
						autoFocus
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onBlur={saveTitle}
						onKeyDown={(e) => {
							if (e.key === "Enter") saveTitle();
							if (e.key === "Escape") {
								setTitle(task.title);
								setEditing(false);
							}
						}}
						className="w-full bg-transparent text-[13.5px] font-semibold outline-none"
					/>
				) : (
					<div
						onDoubleClick={() => !done && setEditing(true)}
						className={cx(
							"truncate text-[13.5px] font-semibold",
							done && "line-through decoration-muted",
						)}
						title={task.title}
					>
						{task.isTop3 && !done && (
							<Star
								size={12}
								className="mr-1.5 inline -mt-0.5 fill-warn text-warn"
							/>
						)}
						{task.title}
					</div>
				)}
				{!compact && (
					<div className="mt-1 flex flex-wrap items-center gap-1.5">
						<ProjectChip project={project} />
						{task.energy && (
							<span className="rounded-[5px] border border-line px-1.5 text-[10.5px] text-muted">
								{task.energy}
							</span>
						)}
						{task.rolloverCount >= 2 && !done && (
							<span
								className="rounded-[5px] bg-warn-bg px-1.5 text-[10.5px] text-warn"
								title="This keeps getting moved. Make it smaller, hand it off, or drop it?"
							>
								carried {task.rolloverCount}×
							</span>
						)}
						{task.nextAction && !done && (
							<span className="truncate font-mono text-[10.5px] text-muted">
								first: {task.nextAction}
							</span>
						)}
					</div>
				)}
			</div>

			<div className="flex items-center gap-1">
				<span className="mr-1 font-mono text-[11px] whitespace-nowrap text-muted tabular">
					{spentMin > 0 &&
						`${formatMinutes(spentMin)}${task.estimateMin ? " / " : ""}`}
					{task.estimateMin
						? formatMinutes(task.estimateMin)
						: spentMin > 0
							? ""
							: ""}
				</span>
				{!done && (
					<>
						<IconButton
							label="Start focus"
							className="opacity-0 group-hover:opacity-100 focus:opacity-100"
							onClick={() => setUi({ startDialog: { taskId: task.id } })}
						>
							<Play size={14} className="fill-current" />
						</IconButton>
						<div className="relative" ref={menuRef}>
							<IconButton label="More" onClick={() => setMenu((m) => !m)}>
								<MoreHorizontal size={16} />
							</IconButton>
							{menu && (
								<div className="animate-pop absolute right-0 top-9 z-30 w-52 rounded-xl border border-line bg-raised p-1 shadow-xl">
									<MenuItem
										icon={<Star size={14} />}
										onClick={() => {
											update.mutate({
												id: task.id,
												isTop3: !task.isTop3,
												plannedFor: task.plannedFor ?? today,
											});
											setMenu(false);
										}}
									>
										{task.isTop3 ? "Remove from top 3" : "Make it a top 3"}
									</MenuItem>
									{onSplit && (
										<MenuItem
											icon={<Scissors size={14} />}
											onClick={() => {
												onSplit(task);
												setMenu(false);
											}}
										>
											Make it smaller
										</MenuItem>
									)}
									{task.plannedFor !== today && (
										<MenuItem
											icon={<Sun size={14} />}
											onClick={() => {
												update.mutate({ id: task.id, plannedFor: today });
												setMenu(false);
											}}
										>
											Do today
										</MenuItem>
									)}
									<MenuItem
										icon={<ArrowRight size={14} />}
										onClick={() => {
											update.mutate({
												id: task.id,
												plannedFor: tomorrowOf(today),
												isTop3: false,
											});
											setMenu(false);
										}}
									>
										Move to tomorrow
									</MenuItem>
									{task.plannedFor && (
										<MenuItem
											icon={<Inbox size={14} />}
											onClick={() => {
												update.mutate({
													id: task.id,
													plannedFor: null,
													isTop3: false,
												});
												setMenu(false);
											}}
										>
											Back to inbox
										</MenuItem>
									)}
									<MenuItem
										icon={<Trash2 size={14} />}
										danger
										onClick={() => {
											attempt(() => del.mutateAsync(task.id));
											setMenu(false);
										}}
									>
										Delete
									</MenuItem>
								</div>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function MenuItem({
	icon,
	children,
	onClick,
	danger,
}: {
	icon: React.ReactNode;
	children: React.ReactNode;
	onClick: () => void;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cx(
				"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-hover cursor-pointer",
				danger ? "text-[#f08a8a]" : "text-fg",
			)}
		>
			<span className="text-muted">{icon}</span>
			{children}
		</button>
	);
}
