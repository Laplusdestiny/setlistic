-- Setlistic DBスキーマ叩き台（PostgreSQL / Supabase）
-- 要件定義書「データモデル案」をもとに、モックアップで必要になった列を足したもの。
-- 実装では Drizzle のスキーマ定義（pgTable + pgPolicy、drizzle-orm/supabase の
-- authenticatedRole / authUid / authUsers）に書き直し、drizzle-kit でマイグレーションを生成する。
-- 「要確認」は docs/open-questions.md の項目と対応している。

create extension if not exists pgcrypto;

-- ───────── 曲 ─────────
create table songs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  apple_track_id   bigint,                      -- 手動登録ではnull
  title            text not null,
  artist           text not null,
  album            text,
  genre            text,
  artwork_url      text,                        -- 文字列のみ保存。MVPでは表示しない
  duration_ms      integer,
  release_date     date,
  apple_url        text,
  source_service   text check (source_service in ('apple_music','spotify','youtube_music','amazon_music','manual','search')),
  source_url       text,                        -- 貼り付けられた元URL（登録元リンク）
  proficiency      text check (proficiency in ('can_sing','practicing','want_to_sing')), -- 要確認：タグ「歌える度」グループと二重管理になる
  song_key         smallint check (song_key between -7 and 7),
  memo             text,                        -- 将来の共有機能では共有対象外
  last_sung_at     date,                        -- sing_logs から更新
  sung_count       integer not null default 0,  -- sing_logs から更新
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, apple_track_id)
);
create index songs_user_created_idx on songs (user_id, created_at desc);
create index songs_user_last_sung_idx on songs (user_id, last_sung_at desc nulls last);
-- フリーワード検索：MVPは ILIKE で足りる（1,000曲規模）。ひらがな・カタカナ揺れは要確認

-- ───────── タグ ─────────
-- 要確認：タググループを採用する場合（モックは「歌える度」「ジャンル」「シーン」「マイタグ」でグループ表示）
create table tag_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  unique (user_id, name)
);

create table tags (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  group_id         uuid references tag_groups(id) on delete set null, -- nullは「マイタグ」扱い
  name             text not null,
  normalized_name  text not null,  -- NFKC、前後空白除去、英字小文字化
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (user_id, normalized_name)
);

-- 要確認：別名（「おはこ」で「十八番」もヒット）を採用する場合
create table tag_aliases (
  tag_id           uuid not null references tags(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  alias            text not null,
  normalized_alias text not null,
  primary key (tag_id, normalized_alias)
);

create table song_tags (
  song_id  uuid not null references songs(id) on delete cascade,
  tag_id   uuid not null references tags(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade, -- RLS判定用に冗長に持つ
  primary key (song_id, tag_id)
);
create index song_tags_tag_idx on song_tags (tag_id);

-- ───────── カスタム項目 ─────────
create table custom_fields (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  field_type   text not null check (field_type in ('text','number','select','multi_select','date','checkbox')),
  options      jsonb,                   -- select系の選択肢 ["DAM","JOYSOUND"] など
  sort_order   integer not null default 0,
  show_in_list boolean not null default false,
  hidden       boolean not null default false,
  unique (user_id, name)
);

create table song_field_values (
  song_id   uuid not null references songs(id) on delete cascade,
  field_id  uuid not null references custom_fields(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  value     jsonb not null,              -- 型ごとの値をjsonbで保持
  primary key (song_id, field_id)
);

-- ───────── 歌唱記録 ─────────
create table sing_logs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  song_id  uuid not null references songs(id) on delete cascade,
  sung_at  date not null default current_date,
  ease     smallint check (ease between 1 and 5), -- 歌いやすさ 1 余裕〜5 辛かった、任意
  note     text
);
create index sing_logs_song_idx on sing_logs (song_id, sung_at desc);
-- songs.last_sung_at / sung_count はトリガーかアプリ側で更新する（削除時の再計算も忘れずに）

-- ───────── 保存した検索条件 ─────────
create table saved_searches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  conditions  jsonb not null,  -- { q, tags:{mode:'and'|'or', include:[], exclude:[]}, fields:[...], sort }
  sort_order  integer not null default 0
);

-- ───────── ユーザー設定（モックの設定画面より） ─────────
create table user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  theme            text not null default 'system' check (theme in ('system','light','dark')),
  list_sort        text not null default 'created_desc',
  list_columns     jsonb not null default '["key","tags"]',
  default_tag_ids  uuid[] not null default '{}',   -- 登録時に自動で付けるタグ
  updated_at       timestamptz not null default now()
);

-- ───────── RLS ─────────
-- 全テーブル共通：本人の行だけ読み書きできる
do $$
declare t text;
begin
  foreach t in array array['songs','tag_groups','tags','tag_aliases','song_tags','custom_fields',
                           'song_field_values','sing_logs','saved_searches','user_settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy "own rows" on %I for all to authenticated
                     using ((select auth.uid()) = user_id)
                     with check ((select auth.uid()) = user_id)$p$, t);
  end loop;
end $$;
-- 中間テーブル（song_tags / song_field_values）は、参照先の song・tag も本人のものかを
-- with check で確かめるか、アプリ側の登録処理をDB関数（security invoker）にまとめて担保する。
