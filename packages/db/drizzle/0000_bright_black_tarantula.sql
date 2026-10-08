CREATE TABLE "activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"project_id" integer,
	"workspace" text,
	"file" text,
	"language" text,
	"branch" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"ms" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captures" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"project_id" integer,
	"text" text NOT NULL,
	"kind" text DEFAULT 'parking' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"task_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_plans" (
	"date" date PRIMARY KEY NOT NULL,
	"intention" text,
	"started_at" timestamp with time zone,
	"shutdown_at" timestamp with time zone,
	"energy_rating" integer,
	"went_well" text,
	"got_in_way" text,
	"ai_summary" text
);
--> statement-breakpoint
CREATE TABLE "project_paths" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"path" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"icon" text,
	"status" text DEFAULT 'active' NOT NULL,
	"client" text,
	"billable" boolean DEFAULT false NOT NULL,
	"hourly_rate" real,
	"weekly_target_min" integer,
	"left_off_note" text,
	"left_off_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_pauses" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"paused_at" timestamp with time zone NOT NULL,
	"resumed_at" timestamp with time zone,
	"reason" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'focus' NOT NULL,
	"mode" text NOT NULL,
	"project_id" integer,
	"task_id" integer,
	"planned_sec" integer,
	"intention" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"active_sec" integer,
	"outcome" text,
	"left_off_note" text,
	"focus_rating" integer,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"title" text NOT NULL,
	"notes" text,
	"next_action" text,
	"status" text DEFAULT 'open' NOT NULL,
	"is_top3" boolean DEFAULT false NOT NULL,
	"energy" text,
	"estimate_min" integer,
	"planned_for" date,
	"due_date" date,
	"parent_task_id" integer,
	"rollover_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"task_id" integer,
	"project_id" integer,
	"title" text NOT NULL,
	"start_min" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"kind" text DEFAULT 'task' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_paths" ADD CONSTRAINT "project_paths_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_pauses" ADD CONSTRAINT "session_pauses_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_ts_idx" ON "activity_events" USING btree ("ts");--> statement-breakpoint
CREATE UNIQUE INDEX "project_paths_path_idx" ON "project_paths" USING btree ("path");--> statement-breakpoint
CREATE INDEX "session_pauses_session_idx" ON "session_pauses" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_started_idx" ON "sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "tasks_planned_idx" ON "tasks" USING btree ("planned_for");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "time_blocks_date_idx" ON "time_blocks" USING btree ("date");