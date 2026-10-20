ALTER TABLE "user_settings" ALTER COLUMN "list_columns" SET DEFAULT '["key","tags","priority"]'::jsonb;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "practice_priority" smallint;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_practice_priority_check" CHECK ("songs"."practice_priority" between 1 and 3);