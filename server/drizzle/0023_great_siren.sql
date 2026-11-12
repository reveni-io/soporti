CREATE TABLE "analytics_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"title" text NOT NULL,
	"sql" text,
	"chart" jsonb,
	"layout" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"step" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "analytics_dashboards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shared" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_cards" ADD CONSTRAINT "analytics_cards_dashboard_id_analytics_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."analytics_dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_dashboards" ADD CONSTRAINT "analytics_dashboards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_cards_dashboard_created_idx" ON "analytics_cards" USING btree ("dashboard_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_cards_status_idx" ON "analytics_cards" USING btree ("status");--> statement-breakpoint
CREATE INDEX "analytics_dashboards_user_created_idx" ON "analytics_dashboards" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_dashboards_shared_idx" ON "analytics_dashboards" USING btree ("shared");