CREATE TABLE "jev_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"rev" integer NOT NULL,
	"data" jsonb NOT NULL,
	"set_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jev_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"rev" integer,
	"author_email" text NOT NULL,
	"change" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jev_set_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"version" integer NOT NULL,
	"set" jsonb NOT NULL,
	"author_email" text NOT NULL,
	"change" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jev_set_versions" ADD CONSTRAINT "jev_set_versions_document_id_jev_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."jev_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jev_history_document_created_idx" ON "jev_history" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jev_set_versions_document_version_idx" ON "jev_set_versions" USING btree ("document_id","version");