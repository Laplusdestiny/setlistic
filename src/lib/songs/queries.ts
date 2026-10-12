import type { createClient } from "@/lib/supabase/server";
import { orderSpecs, type SortKey } from "./sort";

type Client = Awaited<ReturnType<typeof createClient>>;

export type SongRow = {
  id: string;
  title: string;
  artist: string;
  songKey: number | null;
  memo: string | null;
  appleUrl: string | null;
  lastSungAt: string | null;
  sungCount: number;
  tags: { id: string; name: string }[];
};

export type SingLogRow = { id: string; sungAt: string; ease: number | null; note: string | null };

export type SingState = { logs: SingLogRow[]; sungCount: number; lastSungAt: string | null };

type RawSong = {
  id: string;
  title: string;
  artist: string;
  song_key: number | null;
  memo: string | null;
  apple_url: string | null;
  last_sung_at: string | null;
  sung_count: number;
  tags: { tag: { id: string; name: string } | null }[] | null;
};

const COLUMNS =
  "id, title, artist, song_key, memo, apple_url, last_sung_at, sung_count, tags:song_tags(tag:tags(id, name))";

function toSongRow(r: RawSong): SongRow {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    songKey: r.song_key,
    memo: r.memo,
    appleUrl: r.apple_url,
    lastSungAt: r.last_sung_at,
    sungCount: r.sung_count,
    tags: (r.tags ?? [])
      .flatMap((t) => (t.tag ? [t.tag] : []))
      .sort((a, b) => a.name.localeCompare(b.name, "ja")),
  };
}

/** セトリ一覧。RLS により自分の曲だけが返る */
export async function listSongs(
  supabase: Client,
  opts: { sort: SortKey; tagId?: string | null },
): Promise<SongRow[]> {
  // タグで絞り込んでも、各曲の全タグを表示できるよう、絞り込み用の埋め込みは別名にする
  let q = opts.tagId
    ? supabase
        .from("songs")
        .select(`${COLUMNS}, filter:song_tags!inner(tag_id)`)
        .eq("filter.tag_id", opts.tagId)
    : supabase.from("songs").select(COLUMNS);

  for (const o of orderSpecs(opts.sort)) {
    q = q.order(o.column, { ascending: o.ascending, nullsFirst: o.nullsFirst });
  }
  const { data, error } = await q.limit(5000);
  if (error) throw new Error("曲の読み込みに失敗しました");
  return ((data ?? []) as unknown as RawSong[]).map(toSongRow);
}

export async function getSong(supabase: Client, id: string): Promise<SongRow | null> {
  const { data } = await supabase.from("songs").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toSongRow(data as unknown as RawSong) : null;
}

/** 歌唱記録（新しい順）と、DB のトリガーが更新した集計値 */
export async function getSingState(supabase: Client, songId: string): Promise<SingState> {
  const [logs, song] = await Promise.all([
    supabase
      .from("sing_logs")
      .select("id, sung_at, ease, note")
      .eq("song_id", songId)
      .order("sung_at", { ascending: false })
      .order("id")
      .limit(100),
    supabase.from("songs").select("sung_count, last_sung_at").eq("id", songId).maybeSingle(),
  ]);
  return {
    logs: (logs.data ?? []).map((l) => ({
      id: l.id,
      sungAt: l.sung_at,
      ease: l.ease,
      note: l.note,
    })),
    sungCount: song.data?.sung_count ?? 0,
    lastSungAt: song.data?.last_sung_at ?? null,
  };
}

export type TagWithCount = { id: string; name: string; groupId: string | null; count: number };

/** タグと使用曲数（フィルターチップの「よく使うタグ」用） */
export async function listTagsWithCount(supabase: Client): Promise<TagWithCount[]> {
  const { data } = await supabase
    .from("tags")
    .select("id, name, group_id, sort_order, uses:song_tags(count)")
    .order("sort_order");
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    groupId: t.group_id,
    count: (t.uses as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}
