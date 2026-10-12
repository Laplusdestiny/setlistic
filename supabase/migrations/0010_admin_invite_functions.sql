-- 招待の管理（管理者だけ）。
-- どの関数も security definer で、最初に「呼び出したユーザーが app_admins にいるか」を検査する。
-- 許可リスト（allowed_emails）にはメールアドレスそのものを入れない：入力されたメールは関数の中でハッシュにして捨てる。
-- ハッシュの計算は、サインアップを検査するフック hook_before_user_created と同じ（小文字化 → SHA-256）。

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid());
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
--> statement-breakpoint

-- 一覧：招待ごとに、メモ・招待日・利用状況（ログイン済みか・最終ログイン）。メールアドレスは返さない
CREATE OR REPLACE FUNCTION public.admin_list_invites()
RETURNS TABLE (
  email_hash text,
  label text,
  invited_at timestamptz,
  user_id uuid,
  last_sign_in_at timestamptz,
  is_self boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.email_hash, a.label, a.created_at, u.id, u.last_sign_in_at, (u.id IS NOT DISTINCT FROM auth.uid())
  FROM public.allowed_emails a
  LEFT JOIN auth.users u
    ON encode(sha256(convert_to(lower(coalesce(u.email, '')), 'utf8')), 'hex') = a.email_hash
  ORDER BY a.created_at, a.email_hash;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.admin_list_invites() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.admin_list_invites() TO authenticated;
--> statement-breakpoint

-- 招待を追加（すでにあればメモだけ更新）。戻り値はハッシュ
CREATE OR REPLACE FUNCTION public.admin_add_invite(p_email text, p_label text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_hash text;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  IF v_label IS NOT NULL AND char_length(v_label) > 30 THEN
    RAISE EXCEPTION 'label too long' USING ERRCODE = '22023';
  END IF;

  v_hash := encode(sha256(convert_to(v_email, 'utf8')), 'hex');

  IF NOT EXISTS (SELECT 1 FROM public.allowed_emails WHERE email_hash = v_hash)
     AND (SELECT count(*) FROM public.allowed_emails) >= 200 THEN
    RAISE EXCEPTION 'too many invites' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.allowed_emails (email_hash, label)
  VALUES (v_hash, v_label)
  ON CONFLICT (email_hash) DO UPDATE SET label = coalesce(excluded.label, public.allowed_emails.label);
  RETURN v_hash;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.admin_add_invite(text, text) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.admin_add_invite(text, text) TO authenticated;
--> statement-breakpoint

-- 招待を取り消す。p_delete_user = true なら、そのユーザーのアカウントと全データも削除する
-- （許可リストから消すだけでは、すでに作られたアカウントはログインできてしまうため）。自分自身は取り消せない
CREATE OR REPLACE FUNCTION public.admin_revoke_invite(p_hash text, p_delete_user boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid hash' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_uid FROM auth.users u
  WHERE encode(sha256(convert_to(lower(coalesce(u.email, '')), 'utf8')), 'hex') = p_hash
  LIMIT 1;

  IF v_uid IS NOT DISTINCT FROM auth.uid() AND v_uid IS NOT NULL THEN
    RAISE EXCEPTION 'cannot revoke yourself' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.allowed_emails WHERE email_hash = p_hash;
  IF p_delete_user AND v_uid IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_uid;  -- 全テーブルのデータは ON DELETE CASCADE で消える
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.admin_revoke_invite(text, boolean) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.admin_revoke_invite(text, boolean) TO authenticated;
