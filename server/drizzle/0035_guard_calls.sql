UPDATE "jev_documents" SET "data" = jsonb_set("data", '{enabled}', COALESCE((SELECT "data"->'enabled' FROM "jev_documents" WHERE "id" = 'jev'), 'false'::jsonb)) WHERE "id" IN ('legal', 'github');--> statement-breakpoint
DELETE FROM "jev_documents" WHERE "id" = 'jev';
