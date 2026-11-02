CREATE TABLE "video_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"brief" jsonb NOT NULL,
	"storyboard" jsonb,
	"stage" text NOT NULL,
	"storyboard_error" text,
	"parent_video_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_messages" ADD CONSTRAINT "video_messages_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_parent_video_id_videos_id_fk" FOREIGN KEY ("parent_video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_messages_video_idx" ON "video_messages" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "videos_user_created_idx" ON "videos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "videos_stage_idx" ON "videos" USING btree ("stage");