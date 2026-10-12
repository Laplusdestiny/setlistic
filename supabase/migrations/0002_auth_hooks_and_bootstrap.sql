-- 招待制：Before User Created フック。
-- 許可リスト（メールのSHA-256のみ）にない Google アカウントは auth.users に作らせない。
CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
BEGIN
  v_hash := encode(
    sha256(convert_to(lower(coalesce(event->'user'->>'email', '')), 'utf8')),
    'hex'
  );

  IF EXISTS (SELECT 1 FROM public.allowed_emails WHERE email_hash = v_hash) THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'このアカウントでは利用できません（招待制です）'
    )
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin;
--> statement-breakpoint

-- 初回ログイン時：user_settings と既定のタググループ・タグを作る。
CREATE OR REPLACE FUNCTION public.bootstrap_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group uuid;
  v_name text;
  v_order int := 0;
BEGIN
  INSERT INTO public.user_settings (user_id) VALUES (new.id);

  INSERT INTO public.tag_groups (user_id, name, sort_order)
  VALUES (new.id, 'ジャンル', 1), (new.id, 'シーン', 2), (new.id, 'マイタグ', 3);

  INSERT INTO public.tag_groups (user_id, name, sort_order)
  VALUES (new.id, '歌える度', 0)
  RETURNING id INTO v_group;

  FOREACH v_name IN ARRAY ARRAY['十八番', '歌える', '練習中', '歌いたい'] LOOP
    INSERT INTO public.tags (user_id, group_id, name, normalized_name, sort_order)
    VALUES (new.id, v_group, v_name, lower(normalize(btrim(v_name), NFKC)), v_order);
    v_order := v_order + 1;
  END LOOP;

  RETURN new;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.bootstrap_new_user() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_new_user();
