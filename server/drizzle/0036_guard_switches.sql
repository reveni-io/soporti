INSERT INTO "app_config" ("key", "value", "updated_at")
SELECT 'jev_calls_enabled', 'true'::jsonb, now()
WHERE EXISTS (SELECT 1 FROM "jev_documents" WHERE "data"->'enabled' = 'true'::jsonb)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "app_config" ("key", "value", "updated_at")
SELECT 'guard_sending_enabled', 'true'::jsonb, now()
WHERE EXISTS (SELECT 1 FROM "jev_documents" WHERE "data"->'allowSend' = 'true'::jsonb)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "jev_documents" SET "data" = "data" - 'enabled' - 'allowSend';
