-- 1人あたりの登録できる曲数の上限。値はここ（1か所）で決める。変えるときはこの関数を置き換える。
CREATE OR REPLACE FUNCTION public.max_songs_per_user()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 2000;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.max_songs_per_user() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.max_songs_per_user() TO authenticated;
--> statement-breakpoint

-- 曲の追加前に必ず検査する。1曲の登録・まとめて登録・インポートのどの経路も、ここで止まる。
-- SQLSTATE 53400（configuration_limit_exceeded）。アプリはこのコードで「上限に達しました」と案内する
CREATE OR REPLACE FUNCTION public.enforce_song_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT count(*) FROM public.songs WHERE user_id = NEW.user_id) >= public.max_songs_per_user() THEN
    RAISE EXCEPTION 'song limit reached (%)', public.max_songs_per_user() USING ERRCODE = '53400';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER songs_enforce_limit
BEFORE INSERT ON public.songs
FOR EACH ROW EXECUTE FUNCTION public.enforce_song_limit();
--> statement-breakpoint

-- 自分の登録曲数と上限（画面の表示用）
CREATE OR REPLACE FUNCTION public.song_quota()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'used', (SELECT count(*) FROM public.songs WHERE user_id = auth.uid()),
    'max', public.max_songs_per_user()
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.song_quota() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.song_quota() TO authenticated;
