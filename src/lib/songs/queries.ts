import type { createClient } from "@/lib/supabase/server";
import { toRpcParams, type SearchConditions } from "../search/conditions";
import { toSavedSearch, type SavedSearch } from "../search/saved";
import { FIELD_TYPES, type CustomField } from "../custom-fields";
import { parseQuota, type Quota } from "./quota";
import { parseSort, type SortKey } from "./sort";

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
  /** カスタム項目の値（項目ID → 値） */
  fields: Record<string, unknown>;
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
  field_values: { field_id: string; value: unknown }[] | null;
};

const COLUMNS =
  "id, title, artist, song_key, memo, apple_url, last_sung_at, sung_count, tags:song_tags(tag:tags(id, name)), field_values:song_field_values(field_id, value)";

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
    fields: Object.fromEntries((r.field_values ?? []).map((v) => [v.field_id, v.value])),
  };
}

/** 検索結果（search_songs が返す行） */
type SearchRow = {
  id: string;
  title: string;
  artist: string;
  song_key: number | null;
  memo: string | null;
  apple_url: string | null;
  last_sung_at: string | null;
  sung_count: number;
  tags: { id: string; name: string }[] | null;
  fields: Record<string, unknown> | null;
};

/**
 * 条件に合う曲を DB 関数 search_songs で取得する（条件なしなら全曲）。
 * security invoker なので RLS が効き、自分の曲だけが返る。
 */
export async function searchSongs(
  supabase: Client,
  conditions: SearchConditions,
  defaultSort: SortKey,
): Promise<SongRow[]> {
  const { data, error } = await supabase.rpc("search_songs", {
    p: toRpcParams(conditions, defaultSort),
  });
  if (error) throw new Error("曲の読み込みに失敗しました");
  return ((data ?? []) as SearchRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    songKey: r.song_key,
    memo: r.memo,
    appleUrl: r.apple_url,
    lastSungAt: r.last_sung_at,
    sungCount: r.sung_count,
    tags: r.tags ?? [],
    fields: r.fields ?? {},
  }));
}

export async function listSavedSearches(supabase: Client): Promise<SavedSearch[]> {
  const { data } = await supabase
    .from("saved_searches")
    .select("id, name, conditions")
    .order("sort_order")
    .order("name");
  return (data ?? []).map(toSavedSearch);
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

export type TagWithCount = {
  id: string;
  name: string;
  groupId: string | null;
  count: number;
  aliases: string[];
};

/** タグと使用曲数（フィルターチップの「よく使うタグ」用） */
export async function listTagsWithCount(supabase: Client): Promise<TagWithCount[]> {
  const { data } = await supabase
    .from("tags")
    .select("id, name, group_id, sort_order, uses:song_tags(count), aliases:tag_aliases(alias)")
    .order("sort_order");
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    groupId: t.group_id,
    count: (t.uses as { count: number }[] | null)?.[0]?.count ?? 0,
    aliases: ((t.aliases as { alias: string }[] | null) ?? []).map((a) => a.alias),
  }));
}

type FieldRow = {
  id: string;
  name: string;
  field_type: string;
  options: unknown;
  sort_order: number;
  show_in_list: boolean;
  hidden: boolean;
};

export async function listCustomFields(supabase: Client): Promise<CustomField[]> {
  const { data } = await supabase
    .from("custom_fields")
    .select("id, name, field_type, options, sort_order, show_in_list, hidden")
    .order("sort_order")
    .order("name");
  return ((data ?? []) as FieldRow[]).flatMap((f) => {
    const type = FIELD_TYPES.find((t) => t === f.field_type);
    if (!type) return [];
    return [
      {
        id: f.id,
        name: f.name,
        type,
        options: Array.isArray(f.options)
          ? f.options.filter((o): o is string => typeof o === "string")
          : [],
        sortOrder: f.sort_order,
        showInList: f.show_in_list,
        hidden: f.hidden,
      },
    ];
  });
}

export type UserSettings = { listSort: SortKey; listColumns: string[]; defaultTagIds: string[] };

export async function getUserSettings(supabase: Client, userId: string): Promise<UserSettings> {
  const { data } = await supabase
    .from("user_settings")
    .select("list_sort, list_columns, default_tag_ids")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    listSort: parseSort(data?.list_sort),
    listColumns: Array.isArray(data?.list_columns)
      ? (data.list_columns as unknown[]).filter((c): c is string => typeof c === "string")
      : ["key", "tags"],
    defaultTagIds: data?.default_tag_ids ?? [],
  };
}

/**
 * 初回のチュートリアルがまだか（ホームを開いたらチュートリアルへ送る）。
 * 設定の行が読めないときは「済み」とみなす（読めないたびにチュートリアルへ送り続けないため）
 */
export async function isTutorialPending(supabase: Client, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_settings")
    .select("tutorial_completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? data.tutorial_completed_at === null : false;
}

/** 自分の登録曲数と上限（上限は DB の max_songs_per_user() が決める） */
export async function getSongQuota(supabase: Client): Promise<Quota | null> {
  const { data } = await supabase.rpc("song_quota");
  return parseQuota(data);
}

/** 管理者か（招待の管理画面を出してよいか）。判定は DB 関数が行う */
export async function isAppAdmin(supabase: Client): Promise<boolean> {
  const { data } = await supabase.rpc("is_app_admin");
  return data === true;
}
