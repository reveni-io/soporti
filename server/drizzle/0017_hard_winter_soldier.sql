CREATE TABLE "zendesk_connections" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"subdomain" text NOT NULL,
	"email" text NOT NULL,
	"api_token" text NOT NULL,
	"writes_enabled" boolean DEFAULT false NOT NULL,
	"view_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zendesk_connections" ADD CONSTRAINT "zendesk_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;