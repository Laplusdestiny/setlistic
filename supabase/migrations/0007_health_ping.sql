-- Supabase 無料プランは、一定期間アクセスがないとプロジェクトが一時停止される。
-- 定期ヘルスチェック（Vercel Cron → /api/health）が呼ぶ、DBに触れるだけの軽い関数。
-- データには一切触れず、現在時刻を返すだけ。security invoker（security definer ではない）。
CREATE OR REPLACE FUNCTION public.health_ping()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT now();
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.health_ping() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.health_ping() TO anon, authenticated;
