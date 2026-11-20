CREATE TABLE "auto_approve_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"pr_number" integer NOT NULL,
	"head_sha" text NOT NULL,
	"mode" text NOT NULL,
	"would_approve" boolean NOT NULL,
	"decided_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auto_approve_evaluations_repo_created_idx" ON "auto_approve_evaluations" USING btree ("repo","created_at");