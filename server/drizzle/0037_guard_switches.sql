UPDATE "jev_documents" SET "data" = "data" - 'enabled' - 'allowSend';--> statement-breakpoint
UPDATE "jev_documents"
SET "data" = jsonb_set("data" #- '{set,description}' #- '{set,model}', '{set,questions}', COALESCE((
  SELECT jsonb_agg(
    ("question" - 'instructions' - 'criteria') || CASE
      WHEN jsonb_typeof("question"->'answers') = 'array' THEN jsonb_build_object('answers', (
        SELECT jsonb_agg("answer" - 'criteria' ORDER BY "position")
        FROM jsonb_array_elements("question"->'answers') WITH ORDINALITY AS "answers"("answer", "position")
      ))
      ELSE '{}'::jsonb
    END
    ORDER BY "index"
  )
  FROM jsonb_array_elements("data"->'set'->'questions') WITH ORDINALITY AS "questions"("question", "index")
), '[]'::jsonb))
WHERE jsonb_typeof("data"->'set'->'questions') = 'array';
