import type { Task } from "@deep/shared";
import { useMemo, useState } from "react";
import { SplitDialog } from "../components/SplitDialog";
import { TaskComposer } from "../components/TaskComposer";
import { TaskRow } from "../components/TaskRow";
import { EmptyState, ProjectDot, SectionLabel } from "../components/ui";
import { useProjects, useTasks, useToday } from "../lib/queries";

export function InboxView() {
	const today = useToday();
	const { data: inbox = [] } = useTasks("inbox");
	const { data: upcoming = [] } = useTasks("upcoming", today);
	const { data: projects = [] } = useProjects();
	const [splitting, setSplitting] = useState<Task | null>(null);
	const projectById = useMemo(
		() => new Map(projects.map((p) => [p.id, p])),
		[projects],
	);

	const groups = useMemo(() => {
		const m = new Map<number | null, Task[]>();
		for (const t of inbox)
			m.set(t.projectId, [...(m.get(t.projectId) ?? []), t]);
		return [...m.entries()].sort((a, b) =>
			a[0] === null ? 1 : b[0] === null ? -1 : 0,
		);
	}, [inbox]);

	const later = upcoming.filter((t) => t.plannedFor !== today);

	return (
		<div className="mx-auto flex h-full min-h-0 max-w-[820px] flex-col gap-5 overflow-y-auto pb-10">
			<header>
				<h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
					Inbox
				</h1>
				<p className="mt-1 text-[13px] text-muted">
					Everything that isn't planned for a day yet. Pull from here when you
					plan.
				</p>
			</header>
			<TaskComposer
				projects={projects}
				plannedFor={null}
				placeholder="Add to inbox…"
				autoFocusKey
			/>
			{inbox.length === 0 && (
				<EmptyState title="Inbox zero">
					Captured thoughts you send to the inbox land here.
				</EmptyState>
			)}
			{groups.map(([pid, list]) => {
				const p = pid ? projectById.get(pid) : undefined;
				return (
					<section key={pid ?? "none"} className="flex flex-col gap-2">
						<SectionLabel right={<span>{list.length}</span>}>
							<span className="flex items-center gap-2">
								<ProjectDot color={p?.color} /> {p?.name ?? "No project"}
							</span>
						</SectionLabel>
						{list.map((t) => (
							<TaskRow
								key={t.id}
								task={t}
								project={p}
								onSplit={setSplitting}
								draggable={false}
							/>
						))}
					</section>
				);
			})}
			{later.length > 0 && (
				<section className="flex flex-col gap-2">
					<SectionLabel right={<span>{later.length}</span>}>
						Planned for later days
					</SectionLabel>
					{later.map((t) => (
						<div key={t.id} className="flex items-center gap-3">
							<span className="w-20 shrink-0 font-mono text-[11px] text-muted">
								{new Date(`${t.plannedFor}T12:00:00`).toLocaleDateString(
									"en-GB",
									{ weekday: "short", day: "numeric" },
								)}
							</span>
							<div className="min-w-0 flex-1">
								<TaskRow
									task={t}
									project={projectById.get(t.projectId ?? -1)}
									compact
									draggable={false}
								/>
							</div>
						</div>
					))}
				</section>
			)}
			<SplitDialog task={splitting} onClose={() => setSplitting(null)} />
		</div>
	);
}
