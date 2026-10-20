import { FIELD_TYPES, FIELD_NAME_MAX, OPTION_LENGTH_MAX, OPTION_MAX } from "../custom-fields";
import { isValidDate } from "../format";
import { parsePriority } from "../songs/priority";
import { SORT_KEYS } from "../songs/sort";
import { MAX_TAG_LENGTH } from "../tags/normalize";

export const IMPORT_LIMITS = {
  bytes: 4 * 1024 * 1024, // Vercel の関数のリクエスト本文の上限（4.5MB）に収める
  songs: 5000,
  tags: 1000,
  groups: 100,
  fields: 100,
  logsPerSong: 1000,
  tagsPerSong: 30,
} as const;

const SERVICES = ["apple_music", "spotify", "youtube_music", "amazon_music", "manual", "search"];
const COLUMNS = ["key", "tags"];

type Json = Record<string, unknown>;
const obj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
};
const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

export type ImportPayload = {
  settings?: { list_sort?: string; list_columns?: string[]; default_tags?: string[] };
  tag_groups: { name: string; sort_order: number }[];
  tags: { name: string; group: string | null; sort_order: number; aliases: string[] }[];
  custom_fields: {
    name: string;
    field_type: string;
    options: string[] | null;
    sort_order: number;
    show_in_list: boolean;
    hidden: boolean;
  }[];
  songs: Json[];
};

export type ImportParse =
  { ok: true; payload: ImportPayload; warnings: string[] } | { ok: false; error: string };

function fieldValue(v: unknown): unknown {
  if (typeof v === "string") return v.slice(0, 200);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v))
    return v
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.slice(0, OPTION_LENGTH_MAX));
  return undefined;
}

/**
 * アップロードされた JSON（Setlistic のエクスポート形式 v1）を検証し、DB関数 import_data に渡せる形に整える。
 * 壊れた曲・タグ・項目は取り除き、除いた件数を warnings で返す。形式が違えば全体を拒否する。
 */
export function parseImport(raw: unknown): ImportParse {
  if (!obj(raw) || raw.app !== "setlistic")
    return { ok: false, error: "Setlistic のエクスポートファイルではありません" };
  if (raw.version !== 1) return { ok: false, error: "対応していないバージョンのファイルです" };

  const L = IMPORT_LIMITS;
  const songsRaw = arr(raw.songs);
  const tagsRaw = arr(raw.tags);
  const groupsRaw = arr(raw.tag_groups);
  const fieldsRaw = arr(raw.custom_fields);
  if (songsRaw.length > L.songs) return { ok: false, error: `曲は${L.songs}件までです` };
  if (tagsRaw.length > L.tags) return { ok: false, error: `タグは${L.tags}件までです` };
  if (groupsRaw.length > L.groups)
    return { ok: false, error: `タググループは${L.groups}件までです` };
  if (fieldsRaw.length > L.fields)
    return { ok: false, error: `カスタム項目は${L.fields}件までです` };

  const warnings: string[] = [];
  const drop = (label: string, n: number) =>
    n > 0 && warnings.push(`${label}${n}件は形式が正しくないため取り込みません`);

  // グループ
  let bad = 0;
  const tag_groups: ImportPayload["tag_groups"] = [];
  for (const g of groupsRaw) {
    const name = obj(g) ? str(g.name, 20) : null;
    if (!name) bad++;
    else tag_groups.push({ name, sort_order: (obj(g) && int(g.sort_order, -1e6, 1e6)) || 0 });
  }
  drop("タググループ", bad);

  // タグ
  bad = 0;
  const tags: ImportPayload["tags"] = [];
  for (const t of tagsRaw) {
    const name = obj(t) ? str(t.name, MAX_TAG_LENGTH) : null;
    if (!name || !obj(t)) {
      bad++;
      continue;
    }
    tags.push({
      name,
      group: str(t.group, 20),
      sort_order: int(t.sort_order, -1e6, 1e6) ?? 0,
      aliases: arr(t.aliases)
        .flatMap((a) => {
          const x = str(a, MAX_TAG_LENGTH);
          return x ? [x] : [];
        })
        .slice(0, 10),
    });
  }
  drop("タグ", bad);

  // カスタム項目
  bad = 0;
  const custom_fields: ImportPayload["custom_fields"] = [];
  for (const f of fieldsRaw) {
    const name = obj(f) ? str(f.name, FIELD_NAME_MAX) : null;
    const type = obj(f) ? FIELD_TYPES.find((x) => x === f.field_type) : undefined;
    if (!name || !type || !obj(f)) {
      bad++;
      continue;
    }
    const options = arr(f.options)
      .flatMap((o) => {
        const x = str(o, OPTION_LENGTH_MAX);
        return x ? [x] : [];
      })
      .slice(0, OPTION_MAX);
    if ((type === "select" || type === "multi_select") && options.length === 0) {
      bad++;
      continue;
    }
    custom_fields.push({
      name,
      field_type: type,
      options: type === "select" || type === "multi_select" ? options : null,
      sort_order: int(f.sort_order, -1e6, 1e6) ?? 0,
      show_in_list: f.show_in_list === true,
      hidden: f.hidden === true,
    });
  }
  drop("カスタム項目", bad);

  // 曲
  bad = 0;
  const songs: Json[] = [];
  for (const s of songsRaw) {
    if (!obj(s)) {
      bad++;
      continue;
    }
    const title = str(s.title, 200);
    const artist = str(s.artist, 200);
    if (!title || !artist) {
      bad++;
      continue;
    }
    const logs = arr(s.sing_logs)
      .flatMap((l) => {
        if (!obj(l) || !isValidDate(l.sung_at)) return [];
        const ease = int(l.ease, 1, 5);
        return [{ sung_at: l.sung_at, ease, note: str(l.note, 200) }];
      })
      .slice(0, L.logsPerSong);

    const fields: Record<string, unknown> = {};
    if (obj(s.fields)) {
      for (const [k, v] of Object.entries(s.fields)) {
        const fv = fieldValue(v);
        if (fv !== undefined && k.length <= FIELD_NAME_MAX) fields[k] = fv;
      }
    }

    const trackId =
      typeof s.apple_track_id === "number" &&
      Number.isSafeInteger(s.apple_track_id) &&
      s.apple_track_id > 0
        ? s.apple_track_id
        : null;
    const service = SERVICES.find((x) => x === s.source_service);
    songs.push({
      apple_track_id: trackId,
      title,
      artist,
      album: str(s.album, 200),
      genre: str(s.genre, 100),
      artwork_url: httpsUrl(s.artwork_url),
      duration_ms: int(s.duration_ms, 0, 2147483647),
      release_date: isValidDate(s.release_date) ? s.release_date : null,
      apple_url: httpsUrl(s.apple_url),
      source_service: service ?? (trackId ? "apple_music" : "manual"),
      source_url: httpsUrl(s.source_url),
      song_key: int(s.song_key, -7, 7),
      practice_priority: parsePriority(s.practice_priority),
      memo: typeof s.memo === "string" && s.memo.trim() ? s.memo.trim().slice(0, 2000) : null,
      created_at:
        typeof s.created_at === "string" && !Number.isNaN(Date.parse(s.created_at))
          ? new Date(s.created_at).toISOString()
          : null,
      tags: arr(s.tags)
        .flatMap((t) => {
          const x = str(t, MAX_TAG_LENGTH);
          return x ? [x] : [];
        })
        .slice(0, L.tagsPerSong),
      fields,
      sing_logs: logs,
    });
  }
  drop("曲", bad);

  // 表示設定
  let settings: ImportPayload["settings"];
  if (obj(raw.settings)) {
    const st = raw.settings;
    settings = {
      ...(SORT_KEYS.some((k) => k === st.list_sort) ? { list_sort: st.list_sort as string } : {}),
      ...(Array.isArray(st.list_columns)
        ? {
            list_columns: st.list_columns.filter((c): c is string => COLUMNS.includes(c as string)),
          }
        : {}),
      ...(Array.isArray(st.default_tags)
        ? {
            default_tags: st.default_tags
              .flatMap((t) => {
                const x = str(t, MAX_TAG_LENGTH);
                return x ? [x] : [];
              })
              .slice(0, 30),
          }
        : {}),
    };
  }

  return { ok: true, payload: { settings, tag_groups, tags, custom_fields, songs }, warnings };
}
