CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"question" text NOT NULL,
	"sources" jsonb NOT NULL,
	"profile" text NOT NULL,
	"frequency" text NOT NULL,
	"minute" integer NOT NULL,
	"hour" integer,
	"weekday" integer,
	"month_day" integer,
	"timezone" text NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "schedule_id" integer;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedules_next_run_idx" ON "schedules" USING btree ("next_run_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;