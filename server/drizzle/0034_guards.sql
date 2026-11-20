ALTER TABLE "legal_cases" DROP CONSTRAINT "legal_cases_schedule_id_schedules_id_fk";
--> statement-breakpoint
DROP INDEX "legal_cases_ticket_message_idx";--> statement-breakpoint
ALTER TABLE "legal_cases" ALTER COLUMN "schedule_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD COLUMN "guard_id" text DEFAULT 'legal' NOT NULL;--> statement-breakpoint
UPDATE "legal_cases" SET "user_id" = "schedules"."user_id" FROM "schedules" WHERE "schedules"."id" = "legal_cases"."schedule_id";--> statement-breakpoint
DELETE FROM "legal_cases" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "legal_cases" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_cases" ALTER COLUMN "guard_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_cases_user_idx" ON "legal_cases" USING btree ("user_id");--> statement-breakpoint
UPDATE "schedules" SET "question" = "question" || E'\n\nPass each reply through the Legal guard.' WHERE "legal" = true;--> statement-breakpoint
ALTER TABLE "schedules" DROP COLUMN "legal";