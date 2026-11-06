-- 0015_update_song_source.sql を取り消す（update_song を 0006 の定義＝曲のリンクを書き換えない形に戻す）。
-- 関数を置き換えるだけで、テーブルやデータには触れない（編集で変えた曲のリンクはそのまま残る）。アプリ側も戻す（PR を revert する）のとあわせて行う。
CREATE OR REPLACE FUNCTION public.update_song(
  p_id uuid,
  p_song jsonb,
  p_tag_ids uuid[] DEFAULT '{}',
  p_new_tags jsonb DEFAULT '[]'::jsonb,
  p_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_song->>'title', '')) = '' OR btrim(coalesce(p_song->>'artist', '')) = '' THEN
    RAISE EXCEPTION 'title and artist are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.songs
  SET title = btrim(p_song->>'title'),
      artist = btrim(p_song->>'artist'),
      song_key = (p_song->>'song_key')::smallint,
      memo = nullif(p_song->>'memo', ''),
      updated_at = now()
  WHERE id = p_id AND user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'song not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.song_tags WHERE song_id = p_id AND user_id = v_user;
  PERFORM public.attach_song_tags(p_id, p_tag_ids, p_new_tags);
  PERFORM public.set_song_fields(p_id, p_fields);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.update_song(uuid, jsonb, uuid[], jsonb, jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.update_song(uuid, jsonb, uuid[], jsonb, jsonb) TO authenticated;

-- MCP の apply_migration で name 'update_song_source' として適用していた場合は、適用履歴も消す（SQL Editor に貼って適用した場合は不要）。
-- 先に select で、消す行が 1 行だけであることを確かめてから delete する。
-- select version, name from supabase_migrations.schema_migrations where name = 'update_song_source';
-- delete from supabase_migrations.schema_migrations where name = 'update_song_source';
