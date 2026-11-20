UPDATE "jev_documents"
SET "data" = jsonb_build_object('name', COALESCE("data"->'name', '"GitHub PRs"'::jsonb), 'set', ("data"->'set') - 'rules')
WHERE "id" = 'github';--> statement-breakpoint
UPDATE "jev_documents"
SET "data" = jsonb_set("data", '{name}', COALESCE("data"->'name', '"Legal"'::jsonb))
WHERE "id" = 'legal';
