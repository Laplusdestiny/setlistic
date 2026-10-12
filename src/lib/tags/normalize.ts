/** タグ名の正規化：NFKC、前後空白除去、連続空白を1つに、英字は小文字。DBの normalized_name と同じ規則 */
export function normalizeTagName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** 表示用の名前：NFKC でそろえず、前後空白と連続空白だけ整える（「J-POP」の見た目を保つ） */
export function cleanTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export const MAX_TAG_LENGTH = 30;

export type TagInputError = "empty" | "too_long";

export function validateTagName(name: string): TagInputError | null {
  const clean = tagNameFromInput(name);
  if (!clean) return "empty";
  if ([...clean].length > MAX_TAG_LENGTH) return "too_long";
  return null;
}

/** 入力から先頭の # を取り除いてタグ名にする（「#十八番」→「十八番」） */
export function tagNameFromInput(input: string): string {
  return cleanTagName(input.trim().replace(/^[#＃]+/, ""));
}

/** 正規化後に同じものを1つにまとめる（先に出てきた表記を残す） */
export function dedupeTagNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = tagNameFromInput(raw);
    const key = normalizeTagName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
