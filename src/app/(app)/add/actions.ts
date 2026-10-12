"use server";

import { lookupTrack, searchTracks } from "@/lib/songs/itunes";
import { parseMusicUrl } from "@/lib/songs/apple-url";
import { toRegisterPayload } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";
import type {
  BulkItem,
  BulkSaveItem,
  DuplicateInfo,
  LookupResult,
  SaveResult,
  SearchResult,
} from "./types";

const MAX_BULK = 20;
const UNIQUE_VIOLATION = "23505";

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function findDuplicates(
  supabase: Client,
  trackIds: number[],
): Promise<Map<number, DuplicateInfo>> {
  const map = new Map<number, DuplicateInfo>();
  if (trackIds.length === 0) return map;
  // RLS により自分の曲だけが対象になる
  const { data } = await supabase
    .from("songs")
    .select("id, title, apple_track_id")
    .in("apple_track_id", trackIds);
  for (const row of data ?? []) map.set(row.apple_track_id, { id: row.id, title: row.title });
  return map;
}

async function lookupOne(supabase: Client, input: string): Promise<LookupResult> {
  const parsed = parseMusicUrl(input);
  if (!parsed.ok) {
    return {
      status: "error",
      reason: parsed.reason,
      service: parsed.reason === "unsupported_service" ? parsed.service : undefined,
    };
  }

  let draft;
  try {
    draft = await lookupTrack(parsed.trackId, parsed.country, parsed.canonicalUrl);
  } catch {
    return { status: "error", reason: "network" };
  }
  if (!draft) return { status: "error", reason: "not_found" };

  const dups = await findDuplicates(supabase, [parsed.trackId]);
  return { status: "ok", draft, duplicate: dups.get(parsed.trackId) ?? null };
}

/** URL（共有テキスト可）から曲情報を取得する。登録時にだけ呼ぶ */
export async function lookupFromUrl(input: string): Promise<LookupResult> {
  const { supabase } = await requireUser();
  return lookupOne(supabase, String(input ?? "").slice(0, 2000));
}

/** キーワード検索（iTunes Search API）。呼び出し頻度の制御（デバウンス）はクライアント側 */
export async function searchSongsAction(term: string): Promise<SearchResult> {
  const { supabase } = await requireUser();
  const q = String(term ?? "")
    .trim()
    .slice(0, 100);
  if ([...q].length < 2) return { status: "error", reason: "too_short" };

  try {
    const results = await searchTracks(q);
    const dups = await findDuplicates(
      supabase,
      results.flatMap((r) => (r.appleTrackId ? [r.appleTrackId] : [])),
    );
    return {
      status: "ok",
      results: results.map((r) => ({
        ...r,
        duplicate: r.appleTrackId ? dups.has(r.appleTrackId) : false,
      })),
    };
  } catch {
    return { status: "error", reason: "network" };
  }
}

async function register(supabase: Client, raw: unknown): Promise<SaveResult> {
  const payload = toRegisterPayload(raw);
  if (!payload.ok) return { status: "error", message: payload.error };

  const { data, error } = await supabase.rpc("register_song", {
    p_song: payload.value.song,
    p_tag_ids: payload.value.tagIds,
    p_new_tags: payload.value.newTags,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { status: "duplicate" };
    return { status: "error", message: "保存できませんでした。もう一度お試しください。" };
  }
  return { status: "ok", id: data as string };
}

export async function saveSongAction(raw: unknown): Promise<SaveResult> {
  const { supabase } = await requireUser();
  return register(supabase, raw);
}

/** まとめて登録：複数URLを順に取得する（上限あり。iTunes API の目安は約20回/分） */
export async function lookupManyAction(inputs: string[]): Promise<BulkItem[]> {
  const { supabase } = await requireUser();
  const list = (Array.isArray(inputs) ? inputs : [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, MAX_BULK);

  const out: BulkItem[] = [];
  const seen = new Set<number>();
  for (const input of list) {
    const parsed = parseMusicUrl(input);
    // 同じ貼り付けの中の重複は、APIを呼ばずに印だけ付ける
    if (parsed.ok && seen.has(parsed.trackId)) {
      out.push({ input, result: { status: "error", reason: "not_found" }, repeated: true });
      continue;
    }
    if (parsed.ok) seen.add(parsed.trackId);
    out.push({ input, result: await lookupOne(supabase, input) });
  }
  return out;
}

/** まとめて登録の保存。タグは「登録時に付けるタグ」（user_settings.default_tag_ids）だけを付ける */
export async function saveManyAction(drafts: unknown[]): Promise<BulkSaveItem[]> {
  const { supabase, userId } = await requireUser();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("default_tag_ids")
    .eq("user_id", userId)
    .maybeSingle();
  const tagIds = settings?.default_tag_ids ?? [];

  const out: BulkSaveItem[] = [];
  for (const draft of (Array.isArray(drafts) ? drafts : []).slice(0, MAX_BULK)) {
    const title =
      typeof (draft as { title?: unknown })?.title === "string"
        ? (draft as { title: string }).title
        : "";
    const res = await register(supabase, { draft, songKey: null, memo: "", tagIds, newTags: [] });
    out.push({
      title,
      status: res.status === "ok" ? "ok" : res.status === "duplicate" ? "duplicate" : "error",
    });
  }
  return out;
}
