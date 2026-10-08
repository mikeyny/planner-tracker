import type { TimerMode } from "./timer";

export type Energy = "deep" | "shallow" | "admin";
export type TaskStatus = "open" | "done" | "dropped";
export type SessionKind = "focus" | "break";
export type SessionOutcome = "done" | "progress" | "blocked";
export type SessionSource = "manual" | "vscode" | "auto";
export type PauseReason =
	| "manual"
	| "idle"
	| "vscode_closed"
	| "break"
	| "discarded";
export type CaptureKind = "parking" | "urge" | "interruption";

export interface Project {
	id: number;
	name: string;
	color: string;
	icon: string | null;
	status: "active" | "paused" | "archived";
	client: string | null;
	billable: boolean;
	hourlyRate: number | null;
	weeklyTargetMin: number | null;
	leftOffNote: string | null;
	leftOffAt: string | null;
	paths: string[];
}

export interface Task {
	id: number;
	projectId: number | null;
	title: string;
	notes: string | null;
	nextAction: string | null;
	status: TaskStatus;
	isTop3: boolean;
	energy: Energy | null;
	estimateMin: number | null;
	/** YYYY-MM-DD the task is planned for. null = inbox. */
	plannedFor: string | null;
	dueDate: string | null;
	parentTaskId: number | null;
	rolloverCount: number;
	sortOrder: number;
	doneAt: string | null;
	createdAt: string;
	/** Focus seconds logged against this task (all time). */
	spentSec: number;
}

export interface ProjectRef {
	id: number;
	name: string;
	color: string;
}

export interface ActiveSession {
	id: number;
	kind: SessionKind;
	mode: TimerMode;
	projectId: number | null;
	taskId: number | null;
	/** null = open-ended */
	plannedSec: number | null;
	intention: string | null;
	startedAt: string;
	endedAt: string | null;
	/** Start of the current pause, if paused. */
	pausedAt: string | null;
	pauseReason: PauseReason | null;
	/** Total seconds of finished pauses. */
	pausedSec: number;
	source: SessionSource;
	project: ProjectRef | null;
	task: { id: number; title: string } | null;
}

export interface IdleReturn {
	sessionId: number;
	awaySec: number;
	pausedAt: string;
	canEnd: boolean;
}

export interface ActiveState {
	session: ActiveSession | null;
	idleReturn: IdleReturn | null;
	/** Focus sessions finished today (for the pomodoro counter). */
	focusCountToday: number;
	focusSecToday: number;
	serverNow: string;
}

export interface Capture {
	id: number;
	sessionId: number | null;
	projectId: number | null;
	text: string;
	kind: CaptureKind;
	status: "open" | "triaged" | "deleted";
	createdAt: string;
}

export interface TimeBlock {
	id: number;
	date: string;
	taskId: number | null;
	projectId: number | null;
	title: string;
	/** Minutes since midnight. */
	startMin: number;
	durationMin: number;
	kind: "task" | "meeting" | "break";
}

export interface DayPlan {
	date: string;
	intention: string | null;
	startedAt: string | null;
	shutdownAt: string | null;
	energyRating: number | null;
	wentWell: string | null;
	gotInWay: string | null;
	aiSummary: string | null;
}

export interface ProjectTime {
	projectId: number | null;
	name: string;
	color: string;
	sec: number;
}

export interface DayStats {
	date: string;
	focusSec: number;
	sessions: number;
	tasksDone: number;
	urges: number;
	interruptions: number;
	switches: number;
	perProject: ProjectTime[];
	targetMin: number;
}

export interface Multiplier {
	projectId: number | null;
	name: string;
	color: string;
	/** actual ÷ estimate; null while there are fewer than 3 samples */
	value: number | null;
	samples: number;
}

export interface ExtractedTask {
	/** 24h "HH:MM" when the item is a meeting at a set time; it becomes a timeline block, not a task. */
	meetingAt: string | null;
	title: string;
	projectId: number | null;
	estimateMin: number | null;
	energy: Energy | null;
	nextAction: string | null;
	isTop3: boolean;
	dueDate: string | null;
}

export interface AiStatus {
	gemini: boolean;
	model: string;
	whisper: "ready" | "stopped" | "starting" | "missing";
	whisperModel: string | null;
}

/** Messages pushed over the WebSocket. */
export type ServerEvent =
	| { type: "state"; state: ActiveState }
	| {
			type: "changed";
			what: Array<"tasks" | "projects" | "captures" | "day" | "settings">;
	  }
	| { type: "idle_return"; idle: IdleReturn }
	| { type: "session_ended"; sessionId: number; kind: SessionKind }
	| {
			type: "vscode_suggest";
			kind: "start" | "switch";
			project: ProjectRef;
	  };

export interface HeartbeatInput {
	windowId: string;
	workspaces: string[];
	file: string | null;
	language: string | null;
	branch: string | null;
	focused: boolean;
	editing: boolean;
}

export interface HeartbeatResult {
	project: ProjectRef | null;
	suggest: "start" | "switch" | null;
	state: ActiveState;
}
