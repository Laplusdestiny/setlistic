import {
  describeConditions,
  hasConditions,
  normalizeConditions,
  type SearchConditions,
} from "./conditions";

export const SAVED_NAME_MAX = 30;
export const SAVED_MAX = 30;

export type SavedSearch = { id: string; name: string; conditions: SearchConditions };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** 保存する条件の検証。名前は1〜30文字、条件（または並び順）が1つ以上必要 */
export function toSavedSearchPayload(
  raw: unknown,
): Result<{ name: string; conditions: SearchConditions }> {
  if (typeof raw !== "object" || raw === null)
    return { ok: false, error: "リクエストが正しくありません" };
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, error: "名前を入力してください" };
  if ([...name].length > SAVED_NAME_MAX)
    return { ok: false, error: `名前は${SAVED_NAME_MAX}文字までです` };

  const conditions = normalizeConditions(r.conditions);
  if (!hasConditions(conditions) && conditions.sort === null)
    return { ok: false, error: "保存する条件がありません" };

  return { ok: true, value: { name, conditions } };
}

/** DB の行を安全な形にする（壊れた JSON でも例外にしない） */
export function toSavedSearch(row: { id: string; name: string; conditions: unknown }): SavedSearch {
  return { id: row.id, name: row.name, conditions: normalizeConditions(row.conditions) };
}

/** 保存名の初期値：条件の説明をつなげて30文字に収める */
export function suggestSearchName(
  c: SearchConditions,
  tagName: (id: string) => string | undefined,
): string {
  const text = describeConditions(c, tagName).join(" ");
  return [...text].slice(0, SAVED_NAME_MAX).join("");
}
