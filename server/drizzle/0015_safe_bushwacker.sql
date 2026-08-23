CREATE TABLE "artifact_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"html" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"identifier" text NOT NULL,
	"title" text NOT NULL,
	"latest_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact_shares" ADD CONSTRAINT "artifact_shares_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_shares_artifact_version_idx" ON "artifact_shares" USING btree ("artifact_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_versions_artifact_version_idx" ON "artifact_versions" USING btree ("artifact_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_conversation_identifier_idx" ON "artifacts" USING btree ("conversation_id","identifier");