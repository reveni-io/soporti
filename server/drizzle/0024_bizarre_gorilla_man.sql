CREATE TABLE "postgres_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"connection_string" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_cards" ADD COLUMN "connection_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "postgres_connections_name_lower_idx" ON "postgres_connections" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "analytics_cards" ADD CONSTRAINT "analytics_cards_connection_id_postgres_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."postgres_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "postgres_connections" ("name", "connection_string")
SELECT 'database', "value" #>> '{}'
FROM "app_config"
WHERE "key" = 'postgres_connection' AND jsonb_typeof("value") = 'string' AND length("value" #>> '{}') > 0;--> statement-breakpoint
UPDATE "analytics_cards"
SET "connection_id" = (SELECT "id" FROM "postgres_connections" WHERE "name" = 'database');--> statement-breakpoint
UPDATE "app_config"
SET "value" = "value" || '["list_databases"]'::jsonb
WHERE "key" = 'main_agent_tools'
  AND jsonb_typeof("value") = 'array'
  AND "value" ?| array['list_database_schemas', 'list_database_tables', 'describe_database_table', 'query_database']
  AND NOT "value" ? 'list_databases';--> statement-breakpoint
UPDATE "subagents"
SET "tools" = "tools" || '["list_databases"]'::jsonb
WHERE jsonb_typeof("tools") = 'array'
  AND "tools" ?| array['list_database_schemas', 'list_database_tables', 'describe_database_table', 'query_database']
  AND NOT "tools" ? 'list_databases';--> statement-breakpoint
DELETE FROM "app_config" WHERE "key" = 'postgres_connection';
