-- 検索・絞り込み。引数は src/lib/search/conditions.ts の toRpcParams() が作る JSON。
-- security invoker なので RLS が効き、自分の曲だけが対象になる。
-- 文字列の比較は strpos(lower(normalize(列, NFKC)), 語)。TS 側の normalizeSearchText と同じ規則で、
-- ワイルドカードのエスケープを考えずに済む。
CREATE OR REPLACE FUNCTION public.search_songs(p jsonb)
RETURNS TABLE (
  id uuid,
  title text,
  artist text,
  song_key smallint,
  memo text,
  apple_url text,
  last_sung_at date,
  sung_count integer,
  tags jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_words text[] := coalesce(array(SELECT jsonb_array_elements_text(coalesce(p->'words', '[]'::jsonb))), '{}');
  v_mode text := coalesce(p->>'tag_mode', 'and');
  v_inc uuid[] := coalesce(array(SELECT (jsonb_array_elements_text(coalesce(p->'tag_include', '[]'::jsonb)))::uuid), '{}');
  v_exc uuid[] := coalesce(array(SELECT (jsonb_array_elements_text(coalesce(p->'tag_exclude', '[]'::jsonb)))::uuid), '{}');
  v_artist text := nullif(p->>'artist', '');
  v_genre text := nullif(p->>'genre', '');
  v_dec int[] := coalesce(array(SELECT (jsonb_array_elements_text(coalesce(p->'decades', '[]'::jsonb)))::int), '{}');
  v_dur jsonb := coalesce(p->'duration_ranges', '[]'::jsonb);
  v_key jsonb := coalesce(p->'key_ranges', '[]'::jsonb);
  v_ease text := nullif(p->>'last_ease', '');
  v_sort text := coalesce(p->>'sort', 'created_desc');
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.title, s.artist, s.song_key, s.memo, s.apple_url, s.last_sung_at, s.sung_count,
    coalesce(
      (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
       FROM public.song_tags st JOIN public.tags t ON t.id = st.tag_id
       WHERE st.song_id = s.id),
      '[]'::jsonb
    )
  FROM public.songs s
  LEFT JOIN LATERAL (
    SELECT l.ease FROM public.sing_logs l
    WHERE l.song_id = s.id ORDER BY l.sung_at DESC, l.id LIMIT 1
  ) le ON true
  WHERE
    -- フリーワード：すべての語が、曲名・アーティスト・アルバム・メモ・タグ名・タグの別名のどれかに含まれる
    NOT EXISTS (
      SELECT 1 FROM unnest(v_words) w
      WHERE NOT (
        strpos(lower(normalize(s.title, NFKC)), w) > 0
        OR strpos(lower(normalize(s.artist, NFKC)), w) > 0
        OR strpos(lower(normalize(coalesce(s.album, ''), NFKC)), w) > 0
        OR strpos(lower(normalize(coalesce(s.memo, ''), NFKC)), w) > 0
        OR EXISTS (
          SELECT 1 FROM public.song_tags st JOIN public.tags t ON t.id = st.tag_id
          WHERE st.song_id = s.id
            AND (strpos(t.normalized_name, w) > 0
                 OR EXISTS (SELECT 1 FROM public.tag_aliases a
                            WHERE a.tag_id = t.id AND strpos(a.normalized_alias, w) > 0))
        )
      )
    )
    -- タグ（含める）：AND は全部、OR はどれか
    AND (
      cardinality(v_inc) = 0
      OR CASE WHEN v_mode = 'or'
           THEN EXISTS (SELECT 1 FROM public.song_tags st
                        WHERE st.song_id = s.id AND st.tag_id = ANY (v_inc))
           ELSE (SELECT count(DISTINCT st.tag_id) FROM public.song_tags st
                 WHERE st.song_id = s.id AND st.tag_id = ANY (v_inc))
                = (SELECT count(DISTINCT x) FROM unnest(v_inc) x)
         END
    )
    -- タグ（除外）
    AND (
      cardinality(v_exc) = 0
      OR NOT EXISTS (SELECT 1 FROM public.song_tags st
                     WHERE st.song_id = s.id AND st.tag_id = ANY (v_exc))
    )
    AND (v_artist IS NULL OR strpos(lower(normalize(s.artist, NFKC)), v_artist) > 0)
    AND (v_genre IS NULL OR strpos(lower(normalize(coalesce(s.genre, ''), NFKC)), v_genre) > 0)
    AND (
      cardinality(v_dec) = 0
      OR (s.release_date IS NOT NULL
          AND (extract(year FROM s.release_date)::int / 10 * 10) = ANY (v_dec))
    )
    AND (
      jsonb_array_length(v_dur) = 0
      OR (s.duration_ms IS NOT NULL AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_dur) r
            WHERE (r->>'min' IS NULL OR s.duration_ms >= (r->>'min')::int)
              AND (r->>'max' IS NULL OR s.duration_ms <= (r->>'max')::int)))
    )
    AND (
      jsonb_array_length(v_key) = 0
      OR (s.song_key IS NOT NULL AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_key) r
            WHERE (r->>'min' IS NULL OR s.song_key >= (r->>'min')::int)
              AND (r->>'max' IS NULL OR s.song_key <= (r->>'max')::int)))
    )
    -- 直近（最新の歌唱記録）の歌いやすさ
    AND (
      v_ease IS NULL
      OR CASE v_ease
           WHEN 'easy' THEN le.ease <= 2
           WHEN 'normal' THEN le.ease = 3
           WHEN 'hard' THEN le.ease >= 4
           WHEN 'not_hard' THEN le.ease IS NULL OR le.ease <= 3
           ELSE true
         END
    )
  ORDER BY
    CASE WHEN v_sort = 'title_asc' THEN s.title END ASC,
    CASE WHEN v_sort = 'artist_asc' THEN s.artist END ASC,
    CASE WHEN v_sort = 'artist_asc' THEN s.title END ASC,
    CASE WHEN v_sort = 'last_sung_asc' THEN s.last_sung_at END ASC NULLS FIRST,
    CASE WHEN v_sort = 'sung_count_desc' THEN s.sung_count END DESC,
    CASE WHEN v_sort = 'created_asc' THEN s.created_at END ASC,
    s.created_at DESC
  LIMIT 5000;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.search_songs(jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.search_songs(jsonb) TO authenticated;
