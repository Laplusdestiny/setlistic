ALTER TABLE "user_settings" ADD COLUMN "tutorial_completed_at" timestamp with time zone;--> statement-breakpoint
-- 既存のユーザーにはチュートリアルを出さない（新しく作られる行だけが null のまま始まる）
UPDATE "user_settings" SET "tutorial_completed_at" = now() WHERE "tutorial_completed_at" IS NULL;
