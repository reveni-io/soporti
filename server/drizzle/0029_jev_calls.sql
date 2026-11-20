CREATE TABLE "jev_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"set_version" integer NOT NULL,
	"model" text NOT NULL,
	"answered_model" text,
	"status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "jev_calls_project_created_idx" ON "jev_calls" USING btree ("project","created_at");