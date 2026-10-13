CREATE TABLE "calendars" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"event_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "window_spans" (
	"id" serial PRIMARY KEY NOT NULL,
	"app" text NOT NULL,
	"exe" text NOT NULL,
	"detail" text,
	"site" text,
	"category" text DEFAULT 'other' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"sec" integer DEFAULT 0 NOT NULL,
	"session_id" integer
);
--> statement-breakpoint
ALTER TABLE "time_blocks" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD COLUMN "calendar_id" integer;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "window_spans" ADD CONSTRAINT "window_spans_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "window_spans_started_idx" ON "window_spans" USING btree ("started_at");