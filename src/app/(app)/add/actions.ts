"use server";

import { sanitizeFieldValues } from "@/lib/custom-fields";
import { lookupTrack, searchTracks } from "@/lib/songs/itunes";
import { listCustomFields } from "@/lib/songs/queries";
import { parseMusicUrl, type ExternalParsed, type ParseResult } from "@/lib/songs/apple-url";
import { resolveExternal } from "@/lib/songs/resolve";
import { SourceError } from "@/lib/songs/source-fetch";
import type { SongDraft } from "@/lib/songs/types";
import { toRegisterPayload } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";
import type {
  BulkItem,
  BulkSaveItem,
  Candidate,
  DuplicateInfo,
  LookupResult,
  SaveResult,
  SearchResult,
} from "./types";

const MAX_BULK = 20;
const UNIQUE_VIOLATION = "23505";
/** 曲数の上限（DB の enforce_song_limit トリガー）：SQLSTATE 53400 */
const LIMIT_EXCEEDED = "53400";

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

/** Apple Music に無い曲の重複判定：登録元（サービス＋正規化したURL）が同じ曲 */
async function findSourceDuplicate(
  supabase: Client,
  service: string,
  url: string,
): Promise<DuplicateInfo> {
  const { data } = await supabase
    .from("songs")
    .select("id, title")
    .eq("source_service", service)
    .eq("source_url", url)
    .limit(1);
  return data?.[0] ? { id: data[0].id, title: data[0].title } : null;
}

const SOURCE_ERRORS = {
  unsupported_url: "not_song",
  fetch_failed: "source_failed",
  meta_not_found: "source_meta_not_found",
} as const;

/** Spotify / YouTube Music：取得元の曲情報を iTunes Search で Apple Music の表記にそろえる */
async function lookupExternal(supabase: Client, parsed: ExternalParsed): Promise<LookupResult> {
  let m;
  try {
    m = await resolveExternal(parsed);
  } catch (e) {
    if (!(e instanceof SourceError)) throw e;
    console.warn(`[lookup] ${parsed.service} ${parsed.canonicalUrl}: ${e.code} ${e.message}`);
    return { status: "error", reason: SOURCE_ERRORS[e.code], service: parsed.service };
  }

  // 重複判定は iTunes の曲IDを優先し、無ければ登録元のURLで見る
  const drafts = [m.best, ...m.candidates].filter((d): d is SongDraft => d !== null);
  const [dups, sourceDup] = await Promise.all([
    findDuplicates(
      supabase,
      drafts.flatMap((d) => (d.appleTrackId ? [d.appleTrackId] : [])),
    ),
    findSourceDuplicate(supabase, m.source.service, m.source.url),
  ]);
  const withDup = (draft: SongDraft): Candidate => ({
    draft,
    duplicate: draft.appleTrackId ? (dups.get(draft.appleTrackId) ?? null) : sourceDup,
  });

  const source = withDup(m.sourceDraft);
  const candidates = m.candidates.map(withDup);
  const first = m.best ? withDup(m.best) : (candidates[0] ?? source);
  return {
    status: "ok",
    draft: first.draft,
    duplicate: first.duplicate,
    external: {
      service: m.source.service,
      confidence: m.confidence,
      source,
      candidates,
      itunesFailed: m.itunesFailed,
    },
  };
}

async function lookupOne(supabase: Client, input: string): Promise<LookupResult> {
  const parsed = parseMusicUrl(input);
  if (parsed.ok && parsed.service !== "apple_music") return lookupExternal(supabase, parsed);
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

  // カスタム項目の値は、サーバーで項目の定義に照らして整える（型・選択肢に合わないものは捨てる）
  const defs = await listCustomFields(supabase);
  const fields = sanitizeFieldValues(defs, (raw as { fields?: unknown }).fields);

  const { data, error } = await supabase.rpc("register_song", {
    p_song: payload.value.song,
    p_tag_ids: payload.value.tagIds,
    p_new_tags: payload.value.newTags,
    p_fields: fields,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { status: "duplicate" };
    if (error.code === LIMIT_EXCEEDED) return { status: "limit" };
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
  const seen = new Set<string>();
  for (const input of list) {
    const parsed = parseMusicUrl(input);
    const key = sameSongKey(parsed);
    // 同じ貼り付けの中の重複は、APIを呼ばずに印だけ付ける
    if (key && seen.has(key)) {
      out.push({ input, result: { status: "error", reason: "not_found" }, repeated: true });
      continue;
    }
    if (key) seen.add(key);
    out.push({ input, result: await lookupOne(supabase, input) });
  }
  return out;
}

/** 同じ貼り付けの中で同じ曲かを見るキー（Apple Music は国違いも同じ曲） */
function sameSongKey(parsed: ParseResult): string | null {
  if (!parsed.ok) return null;
  return parsed.service === "apple_music" ? `apple:${parsed.trackId}` : parsed.canonicalUrl;
}

/**
 * まとめて登録の保存。全曲に、画面で選んだタグ（既存タグIDと新規タグ名）を付ける。
 * 検証は toRegisterPayload が曲ごとに行う（UUIDでないID・長すぎるタグ名などは捨てる）。
 */
export async function saveManyAction(
  drafts: unknown[],
  tagIds: unknown = [],
  newTags: unknown = [],
): Promise<BulkSaveItem[]> {
  const { supabase } = await requireUser();

  const out: BulkSaveItem[] = [];
  for (const draft of (Array.isArray(drafts) ? drafts : []).slice(0, MAX_BULK)) {
    const title =
      typeof (draft as { title?: unknown })?.title === "string"
        ? (draft as { title: string }).title
        : "";
    const res = await register(supabase, { draft, songKey: 0, memo: "", tagIds, newTags });
    out.push({
      title,
      status:
        res.status === "ok"
          ? "ok"
          : res.status === "duplicate"
            ? "duplicate"
            : res.status === "limit"
              ? "limit"
              : "error",
      ...(res.status === "ok" ? { id: res.id } : {}),
    });
    // 上限に達したら、残りは試さずに止める
    if (res.status === "limit") break;
  }
  return out;
}
