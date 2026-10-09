CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_summary" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_kind_period_idx" ON "reviews" USING btree ("kind","period_start");