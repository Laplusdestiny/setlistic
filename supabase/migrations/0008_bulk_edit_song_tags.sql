-- 複数の曲に、タグをまとめて付ける・外す。
-- security invoker なので RLS が効く。他人の曲・タグが混ざっていれば、全体が失敗する（一部だけ変わることはない）。
-- 戻り値：対象にした曲の数
CREATE OR REPLACE FUNCTION public.bulk_edit_song_tags(
  p_song_ids uuid[],
  p_add_tag_ids uuid[] DEFAULT '{}',
  p_new_tags jsonb DEFAULT '[]'::jsonb,
  p_remove_tag_ids uuid[] DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_add uuid[] := coalesce(p_add_tag_ids, '{}');
  v_new jsonb;
  v_group uuid;
  v_owned int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(coalesce(p_song_ids, '{}')) x;
  IF cardinality(v_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(v_ids) > 500 THEN
    RAISE EXCEPTION 'too many songs' USING ERRCODE = '22023';
  END IF;

  -- 全部が自分の曲であること
  SELECT count(*) INTO v_owned FROM public.songs WHERE id = ANY (v_ids) AND user_id = v_user;
  IF v_owned <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'song not found' USING ERRCODE = 'P0002';
  END IF;

  -- 新規タグ（正規化名が同じ既存タグがあればそれを使う）
  FOR v_new IN SELECT * FROM jsonb_array_elements(coalesce(p_new_tags, '[]'::jsonb)) LOOP
    v_group := NULL;
    IF nullif(v_new->>'group', '') IS NOT NULL THEN
      SELECT id INTO v_group FROM public.tag_groups WHERE user_id = v_user AND name = v_new->>'group';
    END IF;
    v_add := v_add || public.ensure_tag_by_name(v_new->>'name', v_group);
  END LOOP;

  -- 付ける（他人のタグIDは song_tags の RLS で弾かれる）
  INSERT INTO public.song_tags (song_id, tag_id, user_id)
  SELECT s, t, v_user FROM unnest(v_ids) s CROSS JOIN (SELECT DISTINCT unnest(v_add) AS t) tags
  ON CONFLICT DO NOTHING;

  -- 外す
  IF cardinality(coalesce(p_remove_tag_ids, '{}')) > 0 THEN
    DELETE FROM public.song_tags
    WHERE song_id = ANY (v_ids) AND tag_id = ANY (p_remove_tag_ids) AND user_id = v_user;
  END IF;

  RETURN cardinality(v_ids);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.bulk_edit_song_tags(uuid[], uuid[], jsonb, uuid[]) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.bulk_edit_song_tags(uuid[], uuid[], jsonb, uuid[]) TO authenticated;
