CREATE TABLE "video_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"sha256" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_frames" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"times" jsonb NOT NULL,
	"image" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"phase" text,
	"progress" integer,
	"step" text,
	"eta_seconds" integer,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request" text,
	"based_on" integer,
	"summary" text,
	"error" text,
	"resume" boolean DEFAULT false NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"preview_ready" boolean DEFAULT false NOT NULL,
	"duration_ms" integer,
	"size_bytes" integer,
	"mp4" "bytea",
	"thumbnail" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_files" ADD CONSTRAINT "video_files_version_id_video_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."video_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_frames" ADD CONSTRAINT "video_frames_version_id_video_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."video_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_shares" ADD CONSTRAINT "video_shares_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "video_assets_video_name_idx" ON "video_assets" USING btree ("video_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "video_files_version_path_idx" ON "video_files" USING btree ("version_id","path");--> statement-breakpoint
CREATE INDEX "video_frames_version_idx" ON "video_frames" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_shares_video_version_idx" ON "video_shares" USING btree ("video_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "video_versions_video_version_idx" ON "video_versions" USING btree ("video_id","version");--> statement-breakpoint
CREATE INDEX "video_versions_status_queued_idx" ON "video_versions" USING btree ("status","queued_at");