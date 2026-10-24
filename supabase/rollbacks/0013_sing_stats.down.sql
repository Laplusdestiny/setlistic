-- 0013_sing_stats.sql を取り消す（振り返りページの集計関数を消す）。
-- テーブルやデータには触れないので、実行しても歌唱記録などは消えない。
-- 実行後は /stats が常に「記録なし」の表示になる。アプリ側も戻す（PR を revert する）のとあわせて行う。
DROP FUNCTION IF EXISTS public.sing_stats(date, date);

-- MCP の apply_migration で name 'sing_stats' として適用していた場合は、適用履歴も消す（SQL Editor に貼って適用した場合は不要）。
-- 名前は完全一致で指定する（0004 の 'sing_stats_and_update_song' を巻き込まないため。like は使わない）。
-- 先に select で、消す行が 1 行だけであることを確かめてから delete する。
-- select version, name from supabase_migrations.schema_migrations where name = 'sing_stats';
-- delete from supabase_migrations.schema_migrations where name = 'sing_stats';
