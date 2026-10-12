import {
  cleanTagName,
  MAX_TAG_LENGTH,
  normalizeTagName,
  tagNameFromInput,
  validateTagName,
} from "./normalize";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const GROUP_NAME_MAX = 20;
export const ALIAS_MAX = 10;

/** タグ名の変更。他のタグと正規化後に同じ名前になるなら拒否し、統合を案内する */
export function validateRename(
  newName: string,
  selfId: string,
  tags: { id: string; name: string }[],
): Result<{ name: string; normalized: string }> {
  const problem = validateTagName(newName);
  if (problem === "empty") return { ok: false, error: "タグ名を入力してください" };
  if (problem === "too_long") return { ok: false, error: `タグ名は${MAX_TAG_LENGTH}文字までです` };

  const name = tagNameFromInput(newName);
  const normalized = normalizeTagName(name);
  const clash = tags.find((t) => t.id !== selfId && normalizeTagName(t.name) === normalized);
  if (clash)
    return {
      ok: false,
      error: `「${clash.name}」というタグがすでにあります。同じタグにまとめるなら「別のタグに統合」を使ってください`,
    };
  return { ok: true, value: { name, normalized } };
}

/** 別名の追加。自分のタグ名・既存タグ名・既存の別名と重なるものは拒否 */
export function validateAlias(
  input: string,
  tag: { id: string; name: string },
  tags: { id: string; name: string }[],
  existingAliases: string[],
): Result<{ alias: string; normalized: string }> {
  const problem = validateTagName(input);
  if (problem === "empty") return { ok: false, error: "別名を入力してください" };
  if (problem === "too_long") return { ok: false, error: `別名は${MAX_TAG_LENGTH}文字までです` };

  const alias = tagNameFromInput(input);
  const normalized = normalizeTagName(alias);
  if (normalized === normalizeTagName(tag.name)) return { ok: false, error: "タグ名と同じです" };
  if (tags.some((t) => normalizeTagName(t.name) === normalized))
    return { ok: false, error: "同じ名前のタグがあります" };
  if (existingAliases.some((a) => normalizeTagName(a) === normalized))
    return { ok: false, error: "すでに登録されています" };
  if (existingAliases.length >= ALIAS_MAX)
    return { ok: false, error: `別名は${ALIAS_MAX}個までです` };
  return { ok: true, value: { alias, normalized } };
}

export function validateGroupName(
  input: string,
  existing: { id: string; name: string }[],
  selfId?: string,
): Result<string> {
  const name = cleanTagName(input);
  if (!name) return { ok: false, error: "グループ名を入力してください" };
  if ([...name].length > GROUP_NAME_MAX)
    return { ok: false, error: `グループ名は${GROUP_NAME_MAX}文字までです` };
  if (existing.some((g) => g.id !== selfId && g.name === name))
    return { ok: false, error: "同じ名前のグループがあります" };
  return { ok: true, value: name };
}

/** 配列内で id を 1つ前／後ろへ動かす（端なら変化なし） */
export function moveItem<T extends { id: string }>(items: T[], id: string, dir: -1 | 1): T[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
