ALTER TABLE "users" ALTER COLUMN "google_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "slack_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_slack_id_unique" UNIQUE("slack_id");