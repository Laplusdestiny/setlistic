-- update_song：曲のリンク（登録元のサービスと URL）も編集できるようにする（Issue #44）。
-- 引数の形は 0006 と同じなので置き換えるだけ。p_song に source_url が無ければ、これまでどおり登録元には触れない。
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
      -- 曲のリンク：p_song に source_url があるときだけ書き換える（null なら URL を消してサービスは残す）
      source_service = CASE WHEN p_song ? 'source_url'
                            THEN coalesce(p_song->>'source_service', source_service)
                            ELSE source_service END,
      source_url = CASE WHEN p_song ? 'source_url' THEN p_song->>'source_url' ELSE source_url END,
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
