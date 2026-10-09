import type {
	AiStatus,
	Capture,
	DayPlan,
	DayStats,
	Multiplier,
	Project,
	Settings,
	Task,
	TimeBlock,
} from "@deep/shared";
import { localDate } from "@deep/shared";
import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import { onServerEvent, setLiveState } from "./live";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
	},
});

/** Server says something changed: refetch the matching queries in every window. */
export function wireInvalidation() {
	return onServerEvent((e) => {
		if (e.type === "changed") {
			for (const what of e.what)
				queryClient.invalidateQueries({ queryKey: [what] });
			if (e.what.includes("tasks")) {
				queryClient.invalidateQueries({ queryKey: ["stats"] });
				queryClient.invalidateQueries({ queryKey: ["capacity"] });
			}
		}
		if (e.type === "session_ended") {
			queryClient.invalidateQueries({ queryKey: ["stats"] });
			queryClient.invalidateQueries({ queryKey: ["day"] });
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
		}
	});
}

/** Today's date, rolling over at midnight. */
export function useToday() {
	const [today, setToday] = useState(localDate());
	useEffect(() => {
		const t = setInterval(() => setToday(localDate()), 30_000);
		return () => clearInterval(t);
	}, []);
	return today;
}

export function tomorrowOf(date: string) {
	const d = new Date(`${date}T12:00:00`);
	d.setDate(d.getDate() + 1);
	return localDate(d);
}

export const useProjects = () =>
	useQuery({
		queryKey: ["projects"],
		queryFn: () => api.get<Project[]>("/projects"),
	});

export const useTasks = (view: string, date?: string, projectId?: number) =>
	useQuery({
		queryKey: ["tasks", view, date, projectId],
		queryFn: () =>
			api.get<Task[]>(
				`/tasks?view=${view}${date ? `&date=${date}` : ""}${projectId ? `&projectId=${projectId}` : ""}`,
			),
	});

export const useSettings = () =>
	useQuery({
		queryKey: ["settings"],
		queryFn: () => api.get<Settings>("/settings"),
	});

export const useDayStats = (date: string) =>
	useQuery({
		queryKey: ["stats", "day", date],
		queryFn: () => api.get<DayStats>(`/stats/day?date=${date}`),
		refetchInterval: 60_000,
	});

export const useMultipliers = () =>
	useQuery({
		queryKey: ["stats", "multipliers"],
		queryFn: () =>
			api.get<{ overall: Multiplier; perProject: Multiplier[] }>(
				"/stats/multipliers",
			),
	});

export interface DaySession {
	id: number;
	kind: "focus" | "break";
	projectId: number | null;
	taskId: number | null;
	startedAt: string;
	endedAt: string | null;
	activeSec: number | null;
	outcome: string | null;
}

export const useDay = (date: string) =>
	useQuery({
		queryKey: ["day", date],
		queryFn: () =>
			api.get<{ plan: DayPlan; blocks: TimeBlock[]; sessions: DaySession[] }>(
				`/day/${date}`,
			),
	});

export interface Capacity {
	plannedMin: number;
	adjustedMin: number;
	availableMin: number;
	multiplier: number | null;
	overloaded: boolean;
}

export const useCapacity = (date: string) =>
	useQuery({
		queryKey: ["capacity", date],
		queryFn: () => api.get<Capacity>(`/day/${date}/capacity`),
		refetchInterval: 5 * 60_000,
	});

export const useCaptures = (status = "open") =>
	useQuery({
		queryKey: ["captures", status],
		queryFn: () => api.get<Capture[]>(`/captures?status=${status}`),
	});

export const useAiStatus = () =>
	useQuery({
		queryKey: ["ai-status"],
		queryFn: () => api.get<AiStatus>("/ai/status"),
		refetchInterval: 15_000,
	});

/* ---------- mutations ---------- */

export function useUpdateTask() {
	return useMutation({
		mutationFn: ({ id, ...patch }: Partial<Task> & { id: number }) =>
			api.patch<Task>(`/tasks/${id}`, patch),
		onMutate: async ({ id, ...patch }) => {
			// Optimistic: patch every cached task list so checkboxes feel instant.
			await queryClient.cancelQueries({ queryKey: ["tasks"] });
			queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
				old?.map((t) => (t.id === id ? { ...t, ...patch } : t)),
			);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
	});
}

export function useCreateTask() {
	return useMutation({
		mutationFn: (input: Partial<Task> & { title: string }) =>
			api.post<Task>("/tasks", input),
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
	});
}

export function useDeleteTask() {
	return useMutation({
		mutationFn: (id: number) => api.del(`/tasks/${id}`),
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
	});
}

export function useUpdateSettings() {
	return useMutation({
		mutationFn: (patch: Partial<Settings>) =>
			api.put<Settings>("/settings", patch),
		onSuccess: (s) => queryClient.setQueryData(["settings"], s),
	});
}

/* ---------- session actions ---------- */

import type { ActiveState, SessionOutcome, TimerMode } from "@deep/shared";

export const session = {
	start: async (input: {
		taskId?: number | null;
		projectId?: number | null;
		mode?: TimerMode;
		minutes?: number | null;
		intention?: string | null;
	}) => setLiveState(await api.post<ActiveState>("/session/start", input)),
	toggle: async () =>
		setLiveState(await api.post<ActiveState>("/session/toggle")),
	pause: async () =>
		setLiveState(await api.post<ActiveState>("/session/pause")),
	resume: async () =>
		setLiveState(await api.post<ActiveState>("/session/resume")),
	stop: async (input: {
		outcome?: SessionOutcome | null;
		leftOffNote?: string | null;
		focusRating?: number | null;
	}) => {
		const res = await api.post<{
			activeSec: number;
			breakMin: number;
			state: ActiveState;
		}>("/session/stop", input);
		setLiveState(res.state);
		return res;
	},
	extend: async (minutes: number) =>
		setLiveState(await api.post<ActiveState>("/session/extend", { minutes })),
	startBreak: async (minutes: number) =>
		setLiveState(await api.post<ActiveState>("/session/break", { minutes })),
	resolveIdle: async (action: "keep" | "break" | "discard" | "end") =>
		setLiveState(await api.post<ActiveState>("/session/idle", { action })),
};

export async function capture(
	text: string,
	kind: "parking" | "urge" | "interruption" = "parking",
) {
	await api.post("/captures", { text, kind });
	queryClient.invalidateQueries({ queryKey: ["captures"] });
}

/* ---------- insights (Phase 4) ---------- */

import type {
	BackupInfo,
	Commit,
	Heatmap,
	WeeklyReview,
	WeekStats,
} from "@deep/shared";

export const useWeekStats = (date: string) =>
	useQuery({
		queryKey: ["stats", "week", date],
		queryFn: () => api.get<WeekStats>(`/stats/week?date=${date}`),
		refetchInterval: 5 * 60_000,
	});

export const useHeatmap = (weeks = 4) =>
	useQuery({
		queryKey: ["stats", "heatmap", weeks],
		queryFn: () => api.get<Heatmap>(`/stats/heatmap?weeks=${weeks}`),
	});

export const useReviewPending = () =>
	useQuery({
		queryKey: ["reviews", "pending"],
		queryFn: () =>
			api.get<{ start: string; done: boolean }>("/reviews/weekly/pending"),
		refetchInterval: 30 * 60_000,
	});

export const useWeeklyReview = (start: string) =>
	useQuery({
		queryKey: ["reviews", "weekly", start],
		queryFn: () => api.get<WeeklyReview>(`/reviews/weekly/${start}`),
	});

export const useBackups = () =>
	useQuery({
		queryKey: ["backups"],
		queryFn: () => api.get<BackupInfo[]>("/backups"),
	});

export const useCommits = (date: string) =>
	useQuery({
		queryKey: ["day", "commits", date],
		queryFn: () => api.get<Commit[]>(`/day/${date}/commits`),
		refetchInterval: 5 * 60_000,
	});
