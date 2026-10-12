import { parseTags, UUID_PATTERN, LIMITS } from "./validate";

export const BULK_MAX_SONGS = 500;

export type BulkTagPayload = {
  songIds: string[];
  addTagIds: string[];
  newTags: { name: string; normalized: string; group?: string }[];
  removeTagIds: string[];
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ids = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string" && UUID_PATTERN.test(x)))]
    : [];

/** タグの一括変更リクエストの検証。曲は1〜500件、付ける/外すのどちらかが必要、同じタグを付けて外すことはできない */
export function toBulkTagPayload(raw: unknown): Result<BulkTagPayload> {
  if (typeof raw !== "object" || raw === null)
    return { ok: false, error: "リクエストが正しくありません" };
  const r = raw as Record<string, unknown>;

  const songIds = ids(r.songIds);
  if (songIds.length === 0) return { ok: false, error: "曲を選んでください" };
  if (songIds.length > BULK_MAX_SONGS)
    return { ok: false, error: `一度に変更できるのは${BULK_MAX_SONGS}曲までです` };

  const add = parseTags(r.addTagIds, r.newTags);
  if (!add.ok) return add;
  const removeTagIds = ids(r.removeTagIds).slice(0, LIMITS.tags);

  if (add.value.tagIds.length + add.value.newTags.length + removeTagIds.length === 0)
    return { ok: false, error: "付けるタグか、外すタグを選んでください" };
  if (add.value.tagIds.some((t) => removeTagIds.includes(t)))
    return { ok: false, error: "同じタグを「付ける」と「外す」の両方には選べません" };

  return {
    ok: true,
    value: { songIds, addTagIds: add.value.tagIds, newTags: add.value.newTags, removeTagIds },
  };
}
