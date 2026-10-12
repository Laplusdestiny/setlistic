-- 曲＋タグを1トランザクションで登録する。
-- security invoker（既定）なので RLS が効く。user_id は引数で受けず auth.uid() を使う。
CREATE OR REPLACE FUNCTION public.register_song(
  p_song jsonb,
  p_tag_ids uuid[] DEFAULT '{}',
  p_new_tags jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_song uuid;
  v_tag uuid;
  v_new jsonb;
  v_group uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(p_song->>'title', '')) = '' OR btrim(coalesce(p_song->>'artist', '')) = '' THEN
    RAISE EXCEPTION 'title and artist are required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.songs (
    user_id, apple_track_id, title, artist, album, genre, artwork_url, duration_ms,
    release_date, apple_url, source_service, source_url, song_key, memo
  ) VALUES (
    v_user,
    (p_song->>'apple_track_id')::bigint,
    btrim(p_song->>'title'),
    btrim(p_song->>'artist'),
    nullif(btrim(coalesce(p_song->>'album', '')), ''),
    nullif(btrim(coalesce(p_song->>'genre', '')), ''),
    nullif(p_song->>'artwork_url', ''),
    (p_song->>'duration_ms')::integer,
    (p_song->>'release_date')::date,
    nullif(p_song->>'apple_url', ''),
    nullif(p_song->>'source_service', ''),
    nullif(p_song->>'source_url', ''),
    (p_song->>'song_key')::smallint,
    nullif(p_song->>'memo', '')
  )
  RETURNING id INTO v_song;

  -- 既存タグ（他人のタグIDを渡しても song_tags の RLS で弾かれる）
  FOREACH v_tag IN ARRAY coalesce(p_tag_ids, '{}') LOOP
    INSERT INTO public.song_tags (song_id, tag_id, user_id)
    VALUES (v_song, v_tag, v_user)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 新規タグ：正規化名が同じ既存タグがあればそれを使う
  FOR v_new IN SELECT * FROM jsonb_array_elements(coalesce(p_new_tags, '[]'::jsonb)) LOOP
    v_group := NULL;
    IF nullif(v_new->>'group', '') IS NOT NULL THEN
      SELECT id INTO v_group FROM public.tag_groups
      WHERE user_id = v_user AND name = v_new->>'group';
    END IF;

    INSERT INTO public.tags (user_id, group_id, name, normalized_name, sort_order)
    VALUES (
      v_user, v_group, btrim(v_new->>'name'), v_new->>'normalized',
      coalesce((SELECT max(sort_order) + 1 FROM public.tags WHERE user_id = v_user AND group_id IS NOT DISTINCT FROM v_group), 0)
    )
    ON CONFLICT (user_id, normalized_name) DO UPDATE SET name = public.tags.name
    RETURNING id INTO v_tag;

    INSERT INTO public.song_tags (song_id, tag_id, user_id)
    VALUES (v_song, v_tag, v_user)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_song;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.register_song(jsonb, uuid[], jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.register_song(jsonb, uuid[], jsonb) TO authenticated;
