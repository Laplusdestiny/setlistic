import { parsePriority, type Priority } from "./priority";
import { parseTags, UUID_PATTERN, LIMITS } from "./validate";

export const BULK_MAX_SONGS = 500;

export type BulkTagPayload = {
  songIds: string[];
  addTagIds: string[];
  newTags: { name: string; normalized: string; group?: string }[];
  removeTagIds: string[];
  priority: { set: false } | { set: true; value: Priority | null };
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ids = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string" && UUID_PATTERN.test(x)))]
    : [];

/** タグ・優先度の一括変更リクエストの検証。曲は1〜500件、タグの付ける/外す・優先度のいずれかが必要、同じタグを付けて外すことはできない */
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

  // 優先度：無い・"keep" は変えない、"none" は解除、1〜3 はその値
  let priority: BulkTagPayload["priority"];
  if (r.priority === undefined || r.priority === "keep") priority = { set: false };
  else if (r.priority === "none") priority = { set: true, value: null };
  else {
    const value = parsePriority(r.priority);
    if (value === null) return { ok: false, error: "練習の優先度が正しくありません" };
    priority = { set: true, value };
  }

  if (
    add.value.tagIds.length + add.value.newTags.length + removeTagIds.length === 0 &&
    !priority.set
  )
    return { ok: false, error: "付けるタグか、外すタグを選んでください" };
  if (add.value.tagIds.some((t) => removeTagIds.includes(t)))
    return { ok: false, error: "同じタグを「付ける」と「外す」の両方には選べません" };

  return {
    ok: true,
    value: {
      songIds,
      addTagIds: add.value.tagIds,
      newTags: add.value.newTags,
      removeTagIds,
      priority,
    },
  };
}
