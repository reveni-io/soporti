CREATE TABLE "bots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"profile" text NOT NULL,
	"avatar_seed" text NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "bot_id" integer;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "bot_id" integer;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "run_date" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "last_result" text;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bots_user_idx" ON "bots" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_bot_idx" ON "conversations" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "schedules_bot_idx" ON "schedules" USING btree ("bot_id");