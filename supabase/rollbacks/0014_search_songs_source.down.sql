-- 0014_search_songs_source.sql を取り消す（search_songs を 0006 の定義＝登録元の列なしに戻す）。
-- 関数を作り直すだけで、テーブルやデータには触れない。アプリ側も戻す（PR を revert する）のとあわせて行う。
DROP FUNCTION public.search_songs(jsonb);
--> statement-breakpoint
CREATE FUNCTION public.search_songs(p jsonb)
RETURNS TABLE (
  id uuid,
  title text,
  artist text,
  song_key smallint,
  memo text,
  apple_url text,
  last_sung_at date,
  sung_count integer,
  tags jsonb,
  fields jsonb
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
    ),
    coalesce(
      (SELECT jsonb_object_agg(v.field_id::text, v.value)
       FROM public.song_field_values v WHERE v.song_id = s.id),
      '{}'::jsonb
    )
  FROM public.songs s
  LEFT JOIN LATERAL (
    SELECT l.ease FROM public.sing_logs l
    WHERE l.song_id = s.id ORDER BY l.sung_at DESC, l.id LIMIT 1
  ) le ON true
  WHERE
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

-- MCP の apply_migration で name 'search_songs_source' として適用していた場合は、適用履歴も消す（SQL Editor に貼って適用した場合は不要）。
-- 先に select で、消す行が 1 行だけであることを確かめてから delete する。
-- select version, name from supabase_migrations.schema_migrations where name = 'search_songs_source';
-- delete from supabase_migrations.schema_migrations where name = 'search_songs_source';
