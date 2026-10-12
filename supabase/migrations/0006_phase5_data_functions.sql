-- ───────── カスタム項目の値（song_field_values）を曲の登録・編集・検索に通す ─────────
-- p_fields は { "<field_id>": <値> } の JSON。値が null のキーは削除、それ以外は上書き（upsert）。
-- 渡されなかった項目（非表示の項目など）の値は触らない。
-- 他人の field_id や曲は song_field_values の RLS で弾かれる（security invoker）。
CREATE OR REPLACE FUNCTION public.set_song_fields(p_song uuid, p_fields jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_key text;
  v_val jsonb;
BEGIN
  FOR v_key, v_val IN SELECT * FROM jsonb_each(coalesce(p_fields, '{}'::jsonb)) LOOP
    IF v_val IS NULL OR jsonb_typeof(v_val) = 'null' THEN
      DELETE FROM public.song_field_values
      WHERE song_id = p_song AND field_id = v_key::uuid AND user_id = v_user;
    ELSE
      INSERT INTO public.song_field_values (song_id, field_id, user_id, value)
      VALUES (p_song, v_key::uuid, v_user, v_val)
      ON CONFLICT (song_id, field_id) DO UPDATE SET value = excluded.value;
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_song_fields(uuid, jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_song_fields(uuid, jsonb) TO authenticated;
--> statement-breakpoint

DROP FUNCTION public.register_song(jsonb, uuid[], jsonb);
--> statement-breakpoint
CREATE FUNCTION public.register_song(
  p_song jsonb,
  p_tag_ids uuid[] DEFAULT '{}',
  p_new_tags jsonb DEFAULT '[]'::jsonb,
  p_fields jsonb DEFAULT '{}'::jsonb
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
  PERFORM public.set_song_fields(v_song, p_fields);
  RETURN v_song;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.register_song(jsonb, uuid[], jsonb, jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.register_song(jsonb, uuid[], jsonb, jsonb) TO authenticated;
--> statement-breakpoint

DROP FUNCTION public.update_song(uuid, jsonb, uuid[], jsonb);
--> statement-breakpoint
CREATE FUNCTION public.update_song(
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
--> statement-breakpoint

-- search_songs：カスタム項目の値（{field_id: 値}）も返す
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
--> statement-breakpoint

-- ───────── タグの統合・削除・並べ替え ─────────
-- 保存した検索条件（include / exclude のタグID）の置き換え。p_to が NULL なら取り除く
CREATE OR REPLACE FUNCTION public.rewrite_tag_refs(p_from uuid, p_to uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  UPDATE public.user_settings
  SET default_tag_ids = coalesce(
        (SELECT array_agg(DISTINCT x)
         FROM (SELECT CASE WHEN d = p_from THEN p_to ELSE d END AS x
               FROM unnest(default_tag_ids) d) q
         WHERE x IS NOT NULL),
        '{}')
  WHERE user_id = v_user AND p_from = ANY (default_tag_ids);

  UPDATE public.saved_searches ss
  SET conditions = jsonb_set(
        jsonb_set(
          ss.conditions, '{include}',
          coalesce((SELECT jsonb_agg(DISTINCT x)
                    FROM (SELECT CASE WHEN v = p_from::text THEN p_to::text ELSE v END AS x
                          FROM jsonb_array_elements_text(coalesce(ss.conditions->'include', '[]'::jsonb)) v) q
                    WHERE x IS NOT NULL), '[]'::jsonb)),
        '{exclude}',
        coalesce((SELECT jsonb_agg(DISTINCT x)
                  FROM (SELECT CASE WHEN v = p_from::text THEN p_to::text ELSE v END AS x
                        FROM jsonb_array_elements_text(coalesce(ss.conditions->'exclude', '[]'::jsonb)) v) q
                  WHERE x IS NOT NULL), '[]'::jsonb))
  WHERE ss.user_id = v_user;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.rewrite_tag_refs(uuid, uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.rewrite_tag_refs(uuid, uuid) TO authenticated;
--> statement-breakpoint

-- p_source を p_target に統合する。曲の紐づけ・別名を移し、統合元の名前は別名として残す
CREATE OR REPLACE FUNCTION public.merge_tags(p_source uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_src public.tags%ROWTYPE;
  v_tgt public.tags%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_source = p_target THEN
    RAISE EXCEPTION 'cannot merge a tag into itself' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_src FROM public.tags WHERE id = p_source AND user_id = v_user;
  SELECT * INTO v_tgt FROM public.tags WHERE id = p_target AND user_id = v_user;
  IF v_src.id IS NULL OR v_tgt.id IS NULL THEN
    RAISE EXCEPTION 'tag not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.song_tags (song_id, tag_id, user_id)
  SELECT st.song_id, p_target, v_user FROM public.song_tags st WHERE st.tag_id = p_source
  ON CONFLICT DO NOTHING;

  INSERT INTO public.tag_aliases (tag_id, user_id, alias, normalized_alias)
  SELECT p_target, v_user, a.alias, a.normalized_alias FROM public.tag_aliases a WHERE a.tag_id = p_source
  ON CONFLICT DO NOTHING;
  INSERT INTO public.tag_aliases (tag_id, user_id, alias, normalized_alias)
  VALUES (p_target, v_user, v_src.name, v_src.normalized_name)
  ON CONFLICT DO NOTHING;

  PERFORM public.rewrite_tag_refs(p_source, p_target);
  DELETE FROM public.tags WHERE id = p_source AND user_id = v_user; -- song_tags / 別名は cascade
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.merge_tags(uuid, uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.merge_tags(uuid, uuid) TO authenticated;
--> statement-breakpoint

-- タグの削除（曲は消えない）。保存した検索条件・登録時に付けるタグからも外す
CREATE OR REPLACE FUNCTION public.delete_tag(p_id uuid)
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
  PERFORM 1 FROM public.tags WHERE id = p_id AND user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tag not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.rewrite_tag_refs(p_id, NULL);
  DELETE FROM public.tags WHERE id = p_id AND user_id = v_user;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_tag(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_tag(uuid) TO authenticated;
--> statement-breakpoint

-- 並べ替え：渡した ID の順に sort_order を 0,1,2… にする（RLS により自分の行だけが対象）
CREATE OR REPLACE FUNCTION public.reorder_tags(p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.tags t SET sort_order = o.ord - 1
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord) WHERE t.id = o.id;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reorder_tag_groups(p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.tag_groups g SET sort_order = o.ord - 1
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord) WHERE g.id = o.id;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reorder_custom_fields(p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.custom_fields f SET sort_order = o.ord - 1
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord) WHERE f.id = o.id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reorder_tags(uuid[]), public.reorder_tag_groups(uuid[]), public.reorder_custom_fields(uuid[]) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reorder_tags(uuid[]), public.reorder_tag_groups(uuid[]), public.reorder_custom_fields(uuid[]) TO authenticated;
--> statement-breakpoint

-- ───────── エクスポート（JSON） ─────────
-- IDではなく名前で参照する形式にして、別アカウントへインポートできるようにする。
-- security invoker なので自分のデータだけが出力される。
CREATE OR REPLACE FUNCTION public.export_data()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'app', 'setlistic',
    'version', 1,
    'exported_at', now(),
    'settings', coalesce(
      (SELECT jsonb_build_object(
          'list_sort', us.list_sort,
          'list_columns', us.list_columns,
          'default_tags', coalesce(
            (SELECT jsonb_agg(t.name ORDER BY t.name) FROM public.tags t WHERE t.id = ANY (us.default_tag_ids)),
            '[]'::jsonb))
       FROM public.user_settings us WHERE us.user_id = auth.uid()),
      '{}'::jsonb),
    'tag_groups', coalesce(
      (SELECT jsonb_agg(jsonb_build_object('name', g.name, 'sort_order', g.sort_order) ORDER BY g.sort_order, g.name)
       FROM public.tag_groups g WHERE g.user_id = auth.uid()),
      '[]'::jsonb),
    'tags', coalesce(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'name', t.name,
            'group', g.name,
            'sort_order', t.sort_order,
            'aliases', coalesce((SELECT jsonb_agg(a.alias ORDER BY a.alias) FROM public.tag_aliases a WHERE a.tag_id = t.id), '[]'::jsonb))
          ORDER BY g.sort_order NULLS LAST, t.sort_order, t.name)
       FROM public.tags t LEFT JOIN public.tag_groups g ON g.id = t.group_id
       WHERE t.user_id = auth.uid()),
      '[]'::jsonb),
    'custom_fields', coalesce(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'name', f.name, 'field_type', f.field_type, 'options', f.options,
            'sort_order', f.sort_order, 'show_in_list', f.show_in_list, 'hidden', f.hidden)
          ORDER BY f.sort_order, f.name)
       FROM public.custom_fields f WHERE f.user_id = auth.uid()),
      '[]'::jsonb),
    'songs', coalesce(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'apple_track_id', s.apple_track_id,
            'title', s.title, 'artist', s.artist, 'album', s.album, 'genre', s.genre,
            'artwork_url', s.artwork_url, 'duration_ms', s.duration_ms, 'release_date', s.release_date,
            'apple_url', s.apple_url, 'source_service', s.source_service, 'source_url', s.source_url,
            'song_key', s.song_key, 'memo', s.memo, 'created_at', s.created_at,
            'tags', coalesce(
              (SELECT jsonb_agg(t.name ORDER BY t.name)
               FROM public.song_tags st JOIN public.tags t ON t.id = st.tag_id WHERE st.song_id = s.id),
              '[]'::jsonb),
            'fields', coalesce(
              (SELECT jsonb_object_agg(f.name, v.value)
               FROM public.song_field_values v JOIN public.custom_fields f ON f.id = v.field_id
               WHERE v.song_id = s.id),
              '{}'::jsonb),
            'sing_logs', coalesce(
              (SELECT jsonb_agg(jsonb_build_object('sung_at', l.sung_at, 'ease', l.ease, 'note', l.note)
                                ORDER BY l.sung_at, l.id)
               FROM public.sing_logs l WHERE l.song_id = s.id),
              '[]'::jsonb))
          ORDER BY s.created_at, s.id)
       FROM public.songs s WHERE s.user_id = auth.uid()),
      '[]'::jsonb)
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.export_data() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.export_data() TO authenticated;
--> statement-breakpoint

-- ───────── インポート（JSON） ─────────
-- タグ名から ID を得る（なければ作る）。正規化は TS の normalizeTagName と同じ規則
CREATE OR REPLACE FUNCTION public.ensure_tag_by_name(p_name text, p_group uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_norm text := lower(regexp_replace(btrim(normalize(p_name, NFKC)), '\s+', ' ', 'g'));
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tags WHERE user_id = v_user AND normalized_name = v_norm;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO public.tags (user_id, group_id, name, normalized_name, sort_order)
  VALUES (
    v_user, p_group, btrim(p_name), v_norm,
    coalesce((SELECT max(sort_order) + 1 FROM public.tags WHERE user_id = v_user AND group_id IS NOT DISTINCT FROM p_group), 0)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ensure_tag_by_name(text, uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.ensure_tag_by_name(text, uuid) TO authenticated;
--> statement-breakpoint

-- 引数は src/lib/data/import.ts の parseImport() が検証・整形した JSON。
-- 既存のデータは消さない（追加のみ）。同じ曲（apple_track_id）・同名のタグ/グループ/項目は再利用する。
-- 1つの関数＝1トランザクションなので、途中で失敗したら全体が取り消される。
CREATE OR REPLACE FUNCTION public.import_data(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_item jsonb;
  v_name text;
  v_val jsonb;
  v_group uuid;
  v_tag uuid;
  v_song uuid;
  v_tid bigint;
  v_type text;
  v_fid uuid;
  v_existing text[];
  v_tags_before int;
  v_fields_before int;
  v_added int := 0;
  v_skipped int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_tags_before FROM public.tags WHERE user_id = v_user;
  SELECT count(*) INTO v_fields_before FROM public.custom_fields WHERE user_id = v_user;
  -- 手動登録の曲は「取り込み前から持っていたもの」だけを重複扱いにする（同名の曲を複数持てるため）
  SELECT coalesce(array_agg(title || E'\n' || artist), '{}') INTO v_existing
  FROM public.songs WHERE user_id = v_user AND apple_track_id IS NULL;

  -- タググループ
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p->'tag_groups', '[]'::jsonb)) LOOP
    INSERT INTO public.tag_groups (user_id, name, sort_order)
    VALUES (v_user, v_item->>'name', coalesce((v_item->>'sort_order')::int, 0))
    ON CONFLICT (user_id, name) DO NOTHING;
  END LOOP;

  -- タグ（グループ・別名つき）
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p->'tags', '[]'::jsonb)) LOOP
    v_group := NULL;
    IF nullif(v_item->>'group', '') IS NOT NULL THEN
      SELECT id INTO v_group FROM public.tag_groups WHERE user_id = v_user AND name = v_item->>'group';
    END IF;
    v_tag := public.ensure_tag_by_name(v_item->>'name', v_group);
    FOR v_name IN SELECT jsonb_array_elements_text(coalesce(v_item->'aliases', '[]'::jsonb)) LOOP
      INSERT INTO public.tag_aliases (tag_id, user_id, alias, normalized_alias)
      VALUES (v_tag, v_user, btrim(v_name), lower(regexp_replace(btrim(normalize(v_name, NFKC)), '\s+', ' ', 'g')))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- カスタム項目
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p->'custom_fields', '[]'::jsonb)) LOOP
    INSERT INTO public.custom_fields (user_id, name, field_type, options, sort_order, show_in_list, hidden)
    VALUES (
      v_user, v_item->>'name', v_item->>'field_type',
      CASE WHEN jsonb_typeof(v_item->'options') = 'array' THEN v_item->'options' END,
      coalesce((v_item->>'sort_order')::int, 0),
      coalesce((v_item->>'show_in_list')::boolean, false),
      coalesce((v_item->>'hidden')::boolean, false)
    )
    ON CONFLICT (user_id, name) DO NOTHING;
  END LOOP;

  -- 曲
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p->'songs', '[]'::jsonb)) LOOP
    v_tid := (v_item->>'apple_track_id')::bigint;
    v_song := NULL;

    IF v_tid IS NULL AND (v_item->>'title') || E'\n' || (v_item->>'artist') = ANY (v_existing) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.songs (
      user_id, apple_track_id, title, artist, album, genre, artwork_url, duration_ms,
      release_date, apple_url, source_service, source_url, song_key, memo, created_at
    ) VALUES (
      v_user, v_tid, v_item->>'title', v_item->>'artist',
      nullif(v_item->>'album', ''), nullif(v_item->>'genre', ''), nullif(v_item->>'artwork_url', ''),
      (v_item->>'duration_ms')::integer, (v_item->>'release_date')::date,
      nullif(v_item->>'apple_url', ''), nullif(v_item->>'source_service', ''), nullif(v_item->>'source_url', ''),
      (v_item->>'song_key')::smallint, nullif(v_item->>'memo', ''),
      coalesce((v_item->>'created_at')::timestamptz, now())
    )
    ON CONFLICT (user_id, apple_track_id) DO NOTHING
    RETURNING id INTO v_song;

    IF v_song IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_added := v_added + 1;

    FOR v_name IN SELECT jsonb_array_elements_text(coalesce(v_item->'tags', '[]'::jsonb)) LOOP
      INSERT INTO public.song_tags (song_id, tag_id, user_id)
      VALUES (v_song, public.ensure_tag_by_name(v_name), v_user)
      ON CONFLICT DO NOTHING;
    END LOOP;

    FOR v_name, v_val IN SELECT * FROM jsonb_each(coalesce(v_item->'fields', '{}'::jsonb)) LOOP
      SELECT id, field_type INTO v_fid, v_type FROM public.custom_fields WHERE user_id = v_user AND name = v_name;
      IF v_fid IS NOT NULL AND (
           (v_type IN ('text', 'select', 'date') AND jsonb_typeof(v_val) = 'string')
        OR (v_type = 'number' AND jsonb_typeof(v_val) = 'number')
        OR (v_type = 'multi_select' AND jsonb_typeof(v_val) = 'array')
        OR (v_type = 'checkbox' AND jsonb_typeof(v_val) = 'boolean')
      ) THEN
        INSERT INTO public.song_field_values (song_id, field_id, user_id, value)
        VALUES (v_song, v_fid, v_user, v_val)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- 歌唱記録（last_sung_at / sung_count はトリガーが再計算する）
    INSERT INTO public.sing_logs (user_id, song_id, sung_at, ease, note)
    SELECT v_user, v_song, (l->>'sung_at')::date, (l->>'ease')::smallint, nullif(l->>'note', '')
    FROM jsonb_array_elements(coalesce(v_item->'sing_logs', '[]'::jsonb)) l;
  END LOOP;

  -- 表示設定（並び順・一覧の項目・登録時に付けるタグ）
  IF jsonb_typeof(p->'settings') = 'object' THEN
    UPDATE public.user_settings
    SET list_sort = coalesce(nullif(p->'settings'->>'list_sort', ''), list_sort),
        list_columns = CASE WHEN jsonb_typeof(p->'settings'->'list_columns') = 'array'
                            THEN p->'settings'->'list_columns' ELSE list_columns END,
        default_tag_ids = CASE WHEN jsonb_typeof(p->'settings'->'default_tags') = 'array'
                               THEN coalesce(
                                 (SELECT array_agg(t.id) FROM public.tags t
                                  WHERE t.user_id = v_user AND t.name IN
                                    (SELECT jsonb_array_elements_text(p->'settings'->'default_tags'))),
                                 '{}')
                               ELSE default_tag_ids END,
        updated_at = now()
    WHERE user_id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'songs_added', v_added,
    'songs_skipped', v_skipped,
    'tags_added', (SELECT count(*) FROM public.tags WHERE user_id = v_user) - v_tags_before,
    'fields_added', (SELECT count(*) FROM public.custom_fields WHERE user_id = v_user) - v_fields_before
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.import_data(jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.import_data(jsonb) TO authenticated;
--> statement-breakpoint

-- ───────── アカウント削除 ─────────
-- auth.users の行を消すには通常サービスロールが必要だが、ユーザー操作にそれは使わない方針。
-- そこで「呼び出したユーザー自身の行だけ」を消す security definer 関数にする。
-- 全テーブルの user_id は auth.users への ON DELETE CASCADE なので、本人のデータはすべて消える。
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  DELETE FROM auth.users WHERE id = v_user;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
