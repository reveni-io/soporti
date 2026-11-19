CREATE TABLE "legal_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"conversation_id" uuid,
	"source" text NOT NULL,
	"ticket_id" text NOT NULL,
	"message_hash" text NOT NULL,
	"ticket_url" text,
	"customer" text NOT NULL,
	"subject" text NOT NULL,
	"customer_message" text NOT NULL,
	"data_facts" jsonb,
	"draft" jsonb,
	"language" text,
	"status" text NOT NULL,
	"reason" text,
	"set_version" integer,
	"jev" jsonb,
	"warnings" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_cases_ticket_message_idx" ON "legal_cases" USING btree ("schedule_id","source","ticket_id","message_hash");--> statement-breakpoint
CREATE INDEX "legal_cases_created_idx" ON "legal_cases" USING btree ("created_at");