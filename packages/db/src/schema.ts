import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	real,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) =>
	timestamp(name, { withTimezone: true, mode: "string" });

export const projects = pgTable("projects", {
	id: serial("id").primaryKey(),
	name: text("name").notNull(),
	color: text("color").notNull(),
	icon: text("icon"),
	status: text("status").notNull().default("active"),
	client: text("client"),
	billable: boolean("billable").notNull().default(false),
	hourlyRate: real("hourly_rate"),
	weeklyTargetMin: integer("weekly_target_min"),
	leftOffNote: text("left_off_note"),
	leftOffAt: ts("left_off_at"),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: ts("created_at").notNull().defaultNow(),
});

/** Folders that belong to a project. VS Code activity is matched against these. */
export const projectPaths = pgTable(
	"project_paths",
	{
		id: serial("id").primaryKey(),
		projectId: integer("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		/** Lower-cased, forward slashes, no trailing slash. */
		path: text("path").notNull(),
	},
	(t) => [uniqueIndex("project_paths_path_idx").on(t.path)],
);

export const tasks = pgTable(
	"tasks",
	{
		id: serial("id").primaryKey(),
		projectId: integer("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		notes: text("notes"),
		nextAction: text("next_action"),
		status: text("status").notNull().default("open"),
		isTop3: boolean("is_top3").notNull().default(false),
		energy: text("energy"),
		estimateMin: integer("estimate_min"),
		plannedFor: date("planned_for", { mode: "string" }),
		dueDate: date("due_date", { mode: "string" }),
		parentTaskId: integer("parent_task_id"),
		rolloverCount: integer("rollover_count").notNull().default(0),
		sortOrder: integer("sort_order").notNull().default(0),
		doneAt: ts("done_at"),
		createdAt: ts("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("tasks_planned_idx").on(t.plannedFor),
		index("tasks_status_idx").on(t.status),
	],
);

export const dayPlans = pgTable("day_plans", {
	date: date("date", { mode: "string" }).primaryKey(),
	intention: text("intention"),
	startedAt: ts("started_at"),
	shutdownAt: ts("shutdown_at"),
	energyRating: integer("energy_rating"),
	wentWell: text("went_well"),
	gotInWay: text("got_in_way"),
	aiSummary: text("ai_summary"),
});

export const timeBlocks = pgTable(
	"time_blocks",
	{
		id: serial("id").primaryKey(),
		date: date("date", { mode: "string" }).notNull(),
		taskId: integer("task_id").references(() => tasks.id, {
			onDelete: "cascade",
		}),
		projectId: integer("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		startMin: integer("start_min").notNull(),
		durationMin: integer("duration_min").notNull(),
		kind: text("kind").notNull().default("task"),
	},
	(t) => [index("time_blocks_date_idx").on(t.date)],
);

export const sessions = pgTable(
	"sessions",
	{
		id: serial("id").primaryKey(),
		kind: text("kind").notNull().default("focus"),
		mode: text("mode").notNull(),
		projectId: integer("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		taskId: integer("task_id").references(() => tasks.id, {
			onDelete: "set null",
		}),
		plannedSec: integer("planned_sec"),
		intention: text("intention"),
		startedAt: ts("started_at").notNull(),
		endedAt: ts("ended_at"),
		activeSec: integer("active_sec"),
		outcome: text("outcome"),
		leftOffNote: text("left_off_note"),
		focusRating: integer("focus_rating"),
		source: text("source").notNull().default("manual"),
	},
	(t) => [index("sessions_started_idx").on(t.startedAt)],
);

export const sessionPauses = pgTable(
	"session_pauses",
	{
		id: serial("id").primaryKey(),
		sessionId: integer("session_id")
			.notNull()
			.references(() => sessions.id, { onDelete: "cascade" }),
		pausedAt: ts("paused_at").notNull(),
		resumedAt: ts("resumed_at"),
		reason: text("reason").notNull().default("manual"),
	},
	(t) => [index("session_pauses_session_idx").on(t.sessionId)],
);

/** Parking-lot thoughts and distraction log entries. */
export const captures = pgTable("captures", {
	id: serial("id").primaryKey(),
	sessionId: integer("session_id").references(() => sessions.id, {
		onDelete: "set null",
	}),
	projectId: integer("project_id").references(() => projects.id, {
		onDelete: "set null",
	}),
	text: text("text").notNull(),
	kind: text("kind").notNull().default("parking"),
	status: text("status").notNull().default("open"),
	taskId: integer("task_id"),
	createdAt: ts("created_at").notNull().defaultNow(),
});

/** Raw activity from VS Code (and later, the window tracker). */
export const activityEvents = pgTable(
	"activity_events",
	{
		id: serial("id").primaryKey(),
		source: text("source").notNull(),
		projectId: integer("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		workspace: text("workspace"),
		file: text("file"),
		language: text("language"),
		branch: text("branch"),
		ts: ts("ts").notNull().defaultNow(),
		durationSec: integer("duration_sec").notNull().default(0),
	},
	(t) => [index("activity_ts_idx").on(t.ts)],
);

export const aiRuns = pgTable("ai_runs", {
	id: serial("id").primaryKey(),
	feature: text("feature").notNull(),
	model: text("model").notNull(),
	inputTokens: integer("input_tokens"),
	outputTokens: integer("output_tokens"),
	ms: integer("ms"),
	ok: boolean("ok").notNull(),
	error: text("error"),
	createdAt: ts("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
	key: text("key").primaryKey(),
	value: jsonb("value").notNull(),
});
