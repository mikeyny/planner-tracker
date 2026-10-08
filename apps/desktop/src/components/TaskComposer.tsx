import type { Project } from "@deep/shared";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCreateTask } from "../lib/queries";
import { attempt, useUi } from "../lib/ui";
import { Kbd, ProjectDot } from "./ui";

/**
 * Quick add. Shorthand: "#smp" picks a project, "45m" / "1h30" sets the estimate,
 * "!" makes it a top 3.
 */
export function parseQuickAdd(raw: string, projects: Project[]) {
	let text = ` ${raw} `;
	let projectId: number | null = null;
	let estimateMin: number | null = null;
	let isTop3 = false;

	const tag = text.match(/\s#([\w-]+)/);
	if (tag) {
		const key = tag[1]!.toLowerCase();
		const p =
			projects.find((x) => x.name.toLowerCase().replace(/\s+/g, "-") === key) ??
			projects.find((x) =>
				x.name
					.toLowerCase()
					.replace(/\s+/g, "")
					.startsWith(key.replace(/-/g, "")),
			);
		if (p) {
			projectId = p.id;
			text = text.replace(tag[0], " ");
		}
	}
	const time = text.match(/\s(?:(\d+)h(?:(\d+)m?)?|(\d+)m(?:in)?)(?=\s)/i);
	if (time) {
		estimateMin = time[3]
			? Number(time[3])
			: Number(time[1]) * 60 + Number(time[2] ?? 0);
		text = text.replace(time[0], " ");
	}
	if (/\s!(?=\s)/.test(text)) {
		isTop3 = true;
		text = text.replace(/\s!(?=\s)/, " ");
	}
	return {
		title: text.replace(/\s+/g, " ").trim(),
		projectId,
		estimateMin,
		isTop3,
	};
}

export function TaskComposer({
	projects,
	plannedFor,
	defaultProjectId,
	placeholder = "Add a task…",
	autoFocusKey,
}: {
	projects: Project[];
	plannedFor: string | null;
	defaultProjectId?: number | null;
	placeholder?: string;
	autoFocusKey?: boolean;
}) {
	const [value, setValue] = useState("");
	const create = useCreateTask();
	const ref = useRef<HTMLInputElement>(null);
	const focusTick = useUi((s) => s.composerFocus);

	useEffect(() => {
		if (autoFocusKey && focusTick) ref.current?.focus();
	}, [focusTick, autoFocusKey]);

	const parsed = parseQuickAdd(value, projects);
	const project = projects.find(
		(p) => p.id === (parsed.projectId ?? defaultProjectId),
	);

	const submit = async () => {
		if (!parsed.title) return;
		const ok = await attempt(() =>
			create.mutateAsync({
				title: parsed.title,
				projectId: parsed.projectId ?? defaultProjectId ?? null,
				estimateMin: parsed.estimateMin,
				isTop3: parsed.isTop3,
				plannedFor,
			}),
		);
		if (ok) setValue("");
	};

	return (
		<div className="flex h-10 items-center gap-2.5 rounded-[11px] border border-dashed border-line px-3 focus-within:border-line-strong focus-within:bg-surface">
			<Plus size={15} className="text-muted" />
			<input
				ref={ref}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") submit();
					if (e.key === "Escape") (e.target as HTMLInputElement).blur();
				}}
				placeholder={placeholder}
				className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint"
			/>
			{value ? (
				<span className="flex items-center gap-2 text-[11px] text-muted">
					{project && (
						<span className="flex items-center gap-1">
							<ProjectDot color={project.color} />
							{project.name}
						</span>
					)}
					{parsed.estimateMin && (
						<span className="font-mono">{parsed.estimateMin}m</span>
					)}
					{parsed.isTop3 && <span className="text-warn">top 3</span>}
				</span>
			) : (
				<span className="hidden items-center gap-1.5 text-[11px] text-faint md:flex">
					#project 45m ! <Kbd>N</Kbd>
				</span>
			)}
		</div>
	);
}
