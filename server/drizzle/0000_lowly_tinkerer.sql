CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"picture" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
