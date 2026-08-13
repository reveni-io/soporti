CREATE TABLE "attachment_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"thumbnail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment_images" ADD CONSTRAINT "attachment_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_images_user_idx" ON "attachment_images" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attachment_images_expires_idx" ON "attachment_images" USING btree ("expires_at");