INSERT INTO "jev_documents" ("id", "rev", "data", "set_version")
SELECT 'auto-approve', 1, jsonb_build_object('repos', COALESCE((
  SELECT jsonb_agg(jsonb_build_object('name', "repo"->>'name', 'mode', "repo"->>'mode'))
  FROM jsonb_array_elements("data"->'repos') AS "repo"
), '[]'::jsonb)), 0
FROM "jev_documents" WHERE "id" = 'github' AND jsonb_typeof("data"->'repos') = 'array'
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "jev_documents"
SET "data" = jsonb_build_object('name', COALESCE("data"->'name', '"GitHub PRs"'::jsonb), 'set', ("data"->'set') - 'rules')
WHERE "id" = 'github';--> statement-breakpoint
UPDATE "jev_documents"
SET "data" = jsonb_set("data", '{name}', COALESCE("data"->'name', '"Legal"'::jsonb))
WHERE "id" = 'legal';
