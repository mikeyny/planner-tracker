import { db, type projects, sessions, type tasks } from "@deep/db";
import type { Energy, Project, Task, TaskStatus } from "@deep/shared";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

export function toProject(
	row: typeof projects.$inferSelect,
	paths: string[],
): Project {
	return {
		id: row.id,
		name: row.name,
		color: row.color,
		icon: row.icon,
		status: row.status as Project["status"],
		client: row.client,
		billable: row.billable,
		hourlyRate: row.hourlyRate,
		weeklyTargetMin: row.weeklyTargetMin,
		leftOffNote: row.leftOffNote,
		leftOffAt: row.leftOffAt,
		paths,
	};
}

export function toTask(row: typeof tasks.$inferSelect, spentSec = 0): Task {
	return {
		id: row.id,
		projectId: row.projectId,
		title: row.title,
		notes: row.notes,
		nextAction: row.nextAction,
		status: row.status as TaskStatus,
		isTop3: row.isTop3,
		energy: row.energy as Energy | null,
		estimateMin: row.estimateMin,
		plannedFor: row.plannedFor,
		dueDate: row.dueDate,
		parentTaskId: row.parentTaskId,
		rolloverCount: row.rolloverCount,
		sortOrder: row.sortOrder,
		doneAt: row.doneAt,
		createdAt: row.createdAt,
		spentSec,
	};
}

/** Focus seconds logged per task, from finished sessions. */
export async function spentByTask(ids: number[]): Promise<Map<number, number>> {
	if (ids.length === 0) return new Map();
	const rows = await db
		.select({
			taskId: sessions.taskId,
			sec: sql<number>`coalesce(sum(${sessions.activeSec}), 0)::int`,
		})
		.from(sessions)
		.where(
			and(
				eq(sessions.kind, "focus"),
				inArray(sessions.taskId, ids),
				isNotNull(sessions.endedAt),
			),
		)
		.groupBy(sessions.taskId);
	return new Map(rows.map((r) => [r.taskId!, Number(r.sec)]));
}

export async function withSpent(
	rows: (typeof tasks.$inferSelect)[],
): Promise<Task[]> {
	const spent = await spentByTask(rows.map((r) => r.id));
	return rows.map((r) => toTask(r, spent.get(r.id) ?? 0));
}
