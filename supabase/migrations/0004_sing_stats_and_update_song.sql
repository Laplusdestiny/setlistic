-- ───────── 歌唱記録 → songs.last_sung_at / sung_count の自動更新 ─────────
-- 追加・日付の変更・削除のどれでも再計算するので、「記録を消すと元に戻る」。
-- security invoker（既定）なので、更新は呼び出しユーザーの RLS の範囲で行われる。
CREATE OR REPLACE FUNCTION public.refresh_song_sing_stats()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.songs s
    SET sung_count = c.n, last_sung_at = c.last_at
    FROM (SELECT count(*)::int AS n, max(sung_at) AS last_at
          FROM public.sing_logs WHERE song_id = OLD.song_id) c
    WHERE s.id = OLD.song_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.songs s
    SET sung_count = c.n, last_sung_at = c.last_at
    FROM (SELECT count(*)::int AS n, max(sung_at) AS last_at
          FROM public.sing_logs WHERE song_id = NEW.song_id) c
    WHERE s.id = NEW.song_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sing_logs_refresh_stats
AFTER INSERT OR UPDATE OR DELETE ON public.sing_logs
FOR EACH ROW EXECUTE FUNCTION public.refresh_song_sing_stats();
--> statement-breakpoint

-- ───────── タグの付け直し（register_song / update_song 共通） ─────────
CREATE OR REPLACE FUNCTION public.attach_song_tags(
  p_song uuid,
  p_tag_ids uuid[],
  p_new_tags jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tag uuid;
  v_new jsonb;
  v_group uuid;
BEGIN
  -- 他人のタグIDを渡しても song_tags の RLS で弾かれる
  FOREACH v_tag IN ARRAY coalesce(p_tag_ids, '{}') LOOP
    INSERT INTO public.song_tags (song_id, tag_id, user_id)
    VALUES (p_song, v_tag, v_user)
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
      coalesce((SELECT max(sort_order) + 1 FROM public.tags
                WHERE user_id = v_user AND group_id IS NOT DISTINCT FROM v_group), 0)
    )
    ON CONFLICT (user_id, normalized_name) DO UPDATE SET name = public.tags.name
    RETURNING id INTO v_tag;

    INSERT INTO public.song_tags (song_id, tag_id, user_id)
    VALUES (p_song, v_tag, v_user)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.attach_song_tags(uuid, uuid[], jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.attach_song_tags(uuid, uuid[], jsonb) TO authenticated;
--> statement-breakpoint

-- register_song を共通関数を使う形に置き換える（挙動は同じ）
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

  PERFORM public.attach_song_tags(v_song, p_tag_ids, p_new_tags);
  RETURN v_song;
END;
$$;
--> statement-breakpoint

-- ───────── 曲の編集（曲名・アーティスト・キー・メモ・タグ） ─────────
CREATE OR REPLACE FUNCTION public.update_song(
  p_id uuid,
  p_song jsonb,
  p_tag_ids uuid[] DEFAULT '{}',
  p_new_tags jsonb DEFAULT '[]'::jsonb
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
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.update_song(uuid, jsonb, uuid[], jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.update_song(uuid, jsonb, uuid[], jsonb) TO authenticated;
