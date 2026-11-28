-- 0016_sing_stats_range.sql を取り消す（3引数の sing_stats を消し、2引数を 0013 の定義に戻す）。
-- 関数だけで、テーブルやデータには触れない。アプリ側も戻す（PR を revert する）のとあわせて行う
-- （先に関数だけ戻すと、新しいアプリの振り返りは集計に失敗して「記録がありません」の表示になる）。
CREATE OR REPLACE FUNCTION public.sing_stats(p_from date, p_today date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH me AS (
    SELECT auth.uid() AS id
  ),
  logs AS (
    SELECT l.song_id, l.sung_at
    FROM public.sing_logs l, me
    WHERE l.user_id = me.id
      AND (p_from IS NULL OR l.sung_at >= p_from)
      AND l.sung_at <= p_today
  ),
  firsts AS (
    SELECT min(l.sung_at) AS first_at
    FROM public.sing_logs l, me
    WHERE l.user_id = me.id
    GROUP BY l.song_id
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'logs', (SELECT count(*) FROM logs),
      'songs', (SELECT count(DISTINCT song_id) FROM logs),
      'days', (SELECT count(DISTINCT sung_at) FROM logs),
      'firstTimes', (
        SELECT count(*) FROM firsts
        WHERE (p_from IS NULL OR first_at >= p_from) AND first_at <= p_today
      )
    ),
    'monthly', coalesce((
      SELECT jsonb_agg(jsonb_build_object('month', m, 'logs', n) ORDER BY m)
      FROM (SELECT to_char(sung_at, 'YYYY-MM') AS m, count(*) AS n FROM logs GROUP BY 1) x
    ), '[]'::jsonb),
    'top', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'title', x.title, 'artist', x.artist, 'count', x.n, 'lastSungAt', x.last
      ) ORDER BY x.n DESC, x.last DESC, x.title)
      FROM (
        SELECT s.id, s.title, s.artist, count(*) AS n, max(l.sung_at) AS last
        FROM logs l JOIN public.songs s ON s.id = l.song_id
        GROUP BY s.id
        ORDER BY n DESC, last DESC, s.title
        LIMIT 10
      ) x
    ), '[]'::jsonb),
    'dormant', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'title', x.title, 'artist', x.artist, 'count', x.sung_count, 'lastSungAt', x.last_sung_at
      ) ORDER BY x.sung_count DESC, x.last_sung_at, x.title)
      FROM (
        SELECT s.id, s.title, s.artist, s.sung_count, s.last_sung_at
        FROM public.songs s, me
        WHERE s.user_id = me.id AND s.sung_count >= 3 AND s.last_sung_at <= p_today - 90
        ORDER BY s.sung_count DESC, s.last_sung_at, s.title
        LIMIT 10
      ) x
    ), '[]'::jsonb),
    'tags', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'count', x.n, 'songs', x.songs)
        ORDER BY x.n DESC, x.songs DESC, x.name)
      FROM (
        SELECT t.id, t.name, count(*) AS n, count(DISTINCT l.song_id) AS songs
        FROM logs l
        JOIN public.song_tags st ON st.song_id = l.song_id
        JOIN public.tags t ON t.id = st.tag_id
        GROUP BY t.id
        ORDER BY n DESC, songs DESC, t.name
        LIMIT 10
      ) x
    ), '[]'::jsonb),
    'artists', coalesce((
      SELECT jsonb_agg(jsonb_build_object('artist', x.artist, 'count', x.n, 'songs', x.songs)
        ORDER BY x.n DESC, x.songs DESC, x.artist)
      FROM (
        SELECT s.artist, count(*) AS n, count(DISTINCT l.song_id) AS songs
        FROM logs l JOIN public.songs s ON s.id = l.song_id
        GROUP BY s.artist
        ORDER BY n DESC, songs DESC, s.artist
        LIMIT 10
      ) x
    ), '[]'::jsonb)
  );
$$;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.sing_stats(date, date, date);

-- MCP の apply_migration で name 'sing_stats_range' として適用していた場合は、適用履歴も消す（SQL Editor に貼って適用した場合は不要）。
-- 先に select で、消す行が 1 行だけであることを確かめてから delete する。
-- select version, name from supabase_migrations.schema_migrations where name = 'sing_stats_range';
-- delete from supabase_migrations.schema_migrations where name = 'sing_stats_range';
