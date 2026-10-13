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
	/** Calendar blocks come from a synced feed and are read-only. */
	source: "manual" | "calendar";
	/** Meeting link for calendar blocks. */
	url: string | null;
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
	/** "gpu" with the CUDA build installed and working, else "cpu". */
	whisperBackend: "gpu" | "cpu" | null;
}

/** Messages pushed over the WebSocket. */
export type ServerEvent =
	| { type: "state"; state: ActiveState }
	| {
			type: "changed";
			what: Array<
				"tasks" | "projects" | "captures" | "day" | "settings" | "calendar"
			>;
	  }
	| { type: "idle_return"; idle: IdleReturn }
	| { type: "session_ended"; sessionId: number; kind: SessionKind }
	| {
			type: "vscode_suggest";
			kind: "start" | "switch";
			project: ProjectRef;
	  }
	/** Browser blocking state changed (allowance granted or expired). */
	| { type: "browser" }
	/** Keeps idle connections (the browser extension's worker) awake. */
	| { type: "ping" }
	/** A distracting app or site has been in front during a focus session. */
	| { type: "drift"; drift: Drift };

export interface Drift {
	sessionId: number;
	/** "YouTube" or "youtube.com" */
	label: string;
	sec: number;
	project: ProjectRef | null;
}

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

/** What the browser extension needs to block sites. */
export interface BrowserState {
	/** Site blocking is switched on in settings. */
	enabled: boolean;
	/** A focus session is running and sites should be blocked now. */
	blocking: boolean;
	/** Distracting domains from settings. */
	sites: string[];
	/** Sites let through for a few minutes ("I need it for this task"). */
	allowed: string[];
	session: {
		project: string | null;
		color: string | null;
		intention: string | null;
		/** When the planned session time runs out; null for open-ended modes. */
		endsAt: string | null;
	} | null;
}

export interface BrowserStatus {
	/** The extension reported in the last 90 seconds. */
	connected: boolean;
	lastSeen: string | null;
	extensionId: string;
	/** Folder to pick in chrome://extensions → Load unpacked. */
	folder: string;
}

/** A subscribed calendar feed (Google Calendar's secret iCal address). */
export interface CalendarFeed {
	id: number;
	name: string;
	/** Shortened, with the secret part hidden. */
	url: string;
	enabled: boolean;
	lastSyncAt: string | null;
	lastError: string | null;
	/** Meeting blocks from the last sync (today -1 to +14 days). */
	eventCount: number;
}

export interface NextMeeting {
	title: string;
	startMin: number;
	durationMin: number;
	at: string;
	inMin: number;
	url: string | null;
}

/* ---------------- voice coach ---------------- */

export type CoachMode = "checkin" | "checkout" | "plan";

/** Something the coach did or proposed during a call. */
export type CoachAction =
	| { action: "intention"; intention: string }
	| {
			action: "wrap_up";
			outcome: SessionOutcome;
			note: string;
			rating: number | null;
	  }
	| { action: "tasks"; tasks: ExtractedTask[] };

/** JSON messages on the /coach socket (audio travels as binary frames). */
export type CoachServerMessage =
	| { type: "ready"; model: string }
	| { type: "transcript"; who: "you" | "coach"; text: string }
	| { type: "interrupted" }
	| { type: "turn_complete" }
	| ({ type: "action" } & CoachAction)
	| {
			type: "ended";
			reason: "done" | "time" | "error";
			message?: string;
	  };
