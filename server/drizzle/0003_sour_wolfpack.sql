CREATE TABLE "conversation_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"item" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"user_id" integer,
	"slack_channel_id" text,
	"slack_thread_ts" text,
	"openai_last_response_id" text,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_items" ADD CONSTRAINT "conversation_items_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_items_conversation_seq_idx" ON "conversation_items" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_slack_thread_idx" ON "conversations" USING btree ("slack_channel_id","slack_thread_ts");