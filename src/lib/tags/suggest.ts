import { normalizeTagName, tagNameFromInput, validateTagName } from "./normalize";

export type SuggestableTag = { id: string; name: string; aliases?: string[] };

export type TagSuggestions<T extends SuggestableTag> = {
  /** 入力に合う既存タグ（前方一致を先に、同順位は名前順） */
  matches: T[];
  /** 入力どおりの名前で新規作成してよいか（既存タグと正規化後に同じ名前なら false） */
  create: string | null;
};

/**
 * タグ入力中の候補。名前・別名を、全角半角・大文字小文字を区別せず部分一致で探す。
 * 入力が空なら候補なし。
 */
export function suggestTags<T extends SuggestableTag>(
  input: string,
  tags: T[],
  limit = 8,
): TagSuggestions<T> {
  const name = tagNameFromInput(input);
  const needle = normalizeTagName(name);
  if (!needle) return { matches: [], create: null };

  const rank = (t: T): number | null => {
    const names = [t.name, ...(t.aliases ?? [])].map(normalizeTagName);
    if (names.some((n) => n === needle)) return 0;
    if (names.some((n) => n.startsWith(needle))) return 1;
    if (names.some((n) => n.includes(needle))) return 2;
    return null;
  };

  const matches = tags
    .flatMap((t) => {
      const r = rank(t);
      return r === null ? [] : [{ t, r }];
    })
    .sort((a, b) => a.r - b.r || a.t.name.localeCompare(b.t.name, "ja"))
    .slice(0, limit)
    .map((x) => x.t);

  const exists = tags.some((t) => normalizeTagName(t.name) === needle);
  return { matches, create: exists || validateTagName(input) ? null : name };
}
