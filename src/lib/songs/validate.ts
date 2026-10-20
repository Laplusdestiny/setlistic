import { clampKey } from "./key";
import { parsePriority, type Priority } from "./priority";
import { dedupeTagNames, normalizeTagName, MAX_TAG_LENGTH } from "../tags/normalize";
import type { SongDraft } from "./types";

export const LIMITS = { title: 200, artist: 200, album: 200, memo: 2000, tags: 30 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICES = [
  "apple_music",
  "spotify",
  "youtube_music",
  "amazon_music",
  "manual",
  "search",
] as const;
/** 登録時に新規タグを入れてよいグループ（Apple Music のジャンルを入れる先） */
const ALLOWED_GROUPS = ["ジャンル"] as const;

export type SaveSongInput = {
  draft: SongDraft;
  songKey: number | null;
  memo: string;
  tagIds: string[];
  newTags: { name: string; group?: string }[];
};

export type RegisterPayload = {
  song: Record<string, unknown>;
  tagIds: string[];
  newTags: { name: string; normalized: string; group?: string }[];
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** https のURLだけ通す（javascript: などを保存しない） */
function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function posInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2_147_483_647 ? v : null;
}

export function sanitizeDraft(raw: unknown): Result<SongDraft> {
  if (!obj(raw)) return { ok: false, error: "曲情報が正しくありません" };
  const title = text(raw.title, LIMITS.title);
  const artist = text(raw.artist, LIMITS.artist);
  if (!title) return { ok: false, error: "曲名を入力してください" };
  if (!artist) return { ok: false, error: "アーティスト名を入力してください" };

  const service = SERVICES.find((s) => s === raw.sourceService) ?? "manual";
  const trackId =
    typeof raw.appleTrackId === "number" &&
    Number.isSafeInteger(raw.appleTrackId) &&
    raw.appleTrackId > 0
      ? raw.appleTrackId
      : null;
  const release =
    typeof raw.releaseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.releaseDate)
      ? raw.releaseDate
      : null;

  return {
    ok: true,
    value: {
      appleTrackId: trackId,
      title,
      artist,
      album: text(raw.album, LIMITS.album),
      genre: text(raw.genre, 100),
      artworkUrl: httpsUrl(raw.artworkUrl),
      durationMs: posInt(raw.durationMs),
      releaseDate: release,
      appleUrl: httpsUrl(raw.appleUrl),
      sourceService: service,
      sourceUrl: httpsUrl(raw.sourceUrl),
    },
  };
}

/** クライアントから届いた登録リクエストを検証し、DB関数に渡す形に整える */
export function toRegisterPayload(raw: unknown): Result<RegisterPayload> {
  if (!obj(raw)) return { ok: false, error: "リクエストが正しくありません" };
  const draft = sanitizeDraft(raw.draft);
  if (!draft.ok) return draft;

  const memo = typeof raw.memo === "string" ? raw.memo.trim().slice(0, LIMITS.memo) : "";
  const key =
    typeof raw.songKey === "number" && Number.isFinite(raw.songKey) ? clampKey(raw.songKey) : null;

  const tags = parseTags(raw.tagIds, raw.newTags);
  if (!tags.ok) return tags;
  const { tagIds, newTags } = tags.value;

  const d = draft.value;
  return {
    ok: true,
    value: {
      song: {
        apple_track_id: d.appleTrackId,
        title: d.title,
        artist: d.artist,
        album: d.album,
        genre: d.genre,
        artwork_url: d.artworkUrl,
        duration_ms: d.durationMs,
        release_date: d.releaseDate,
        apple_url: d.appleUrl,
        source_service: d.sourceService,
        source_url: d.sourceUrl,
        song_key: key,
        memo: memo || null,
      },
      tagIds: [...new Set(tagIds)],
      newTags,
    },
  };
}

type ParsedTags = { tagIds: string[]; newTags: RegisterPayload["newTags"] };

/** タグID（UUIDのみ）と新規タグ名（正規化・重複排除・許可グループのみ）を整える */
export function parseTags(rawIds: unknown, rawNew: unknown): Result<ParsedTags> {
  const tagIds = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === "string" && UUID.test(x))
    : [];
  const list = Array.isArray(rawNew) ? rawNew : [];
  const groupOf = new Map<string, string | undefined>();
  const names: string[] = [];
  for (const t of list) {
    if (!obj(t) || typeof t.name !== "string") continue;
    if ([...t.name].length > MAX_TAG_LENGTH + 1) continue; // 長すぎるものは捨てる
    const group = ALLOWED_GROUPS.find((g) => g === t.group);
    names.push(t.name);
    const key = normalizeTagName(t.name.replace(/^\s*[#＃]+/, ""));
    // 同じタグが重複して届いたとき、先に指定されたグループを消さない
    if (!groupOf.get(key)) groupOf.set(key, group);
  }
  const newTags = dedupeTagNames(names)
    .filter((n) => [...n].length <= MAX_TAG_LENGTH)
    .map((name) => {
      const normalized = normalizeTagName(name);
      return { name, normalized, group: groupOf.get(normalized) };
    });

  const unique = [...new Set(tagIds)];
  if (unique.length + newTags.length > LIMITS.tags)
    return { ok: false, error: `タグは${LIMITS.tags}個までです` };
  return { ok: true, value: { tagIds: unique, newTags } };
}

export type UpdateSongInput = {
  id: string;
  title: string;
  artist: string;
  songKey: number | null;
  memo: string;
  practicePriority: Priority | null;
  tagIds: string[];
  newTags: { name: string; group?: string }[];
};

export type UpdatePayload = {
  id: string;
  song: {
    title: string;
    artist: string;
    song_key: number | null;
    memo: string | null;
    practice_priority: Priority | null;
  };
  tagIds: string[];
  newTags: RegisterPayload["newTags"];
};

/** 編集リクエストの検証。編集できるのは曲名・アーティスト・キー・練習の優先度・メモ・タグだけ */
export function toUpdatePayload(raw: unknown): Result<UpdatePayload> {
  if (!obj(raw)) return { ok: false, error: "リクエストが正しくありません" };
  if (typeof raw.id !== "string" || !UUID.test(raw.id))
    return { ok: false, error: "曲が見つかりません" };
  const title = text(raw.title, LIMITS.title);
  const artist = text(raw.artist, LIMITS.artist);
  if (!title) return { ok: false, error: "曲名を入力してください" };
  if (!artist) return { ok: false, error: "アーティスト名を入力してください" };

  const tags = parseTags(raw.tagIds, raw.newTags);
  if (!tags.ok) return tags;

  const memo = typeof raw.memo === "string" ? raw.memo.trim().slice(0, LIMITS.memo) : "";
  const key =
    typeof raw.songKey === "number" && Number.isFinite(raw.songKey) ? clampKey(raw.songKey) : null;

  return {
    ok: true,
    value: {
      id: raw.id,
      song: {
        title,
        artist,
        song_key: key,
        memo: memo || null,
        practice_priority: parsePriority(raw.practicePriority),
      },
      tagIds: tags.value.tagIds,
      newTags: tags.value.newTags,
    },
  };
}

export { UUID as UUID_PATTERN };
