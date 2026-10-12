import { isValidDate } from "./format";

export const FIELD_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "テキスト",
  number: "数値",
  select: "選択肢（1つ）",
  multi_select: "選択肢（複数）",
  date: "日付",
  checkbox: "チェック",
};

export const FIELD_NAME_MAX = 30;
export const FIELD_MAX_COUNT = 20;
export const OPTION_MAX = 20;
export const OPTION_LENGTH_MAX = 30;
export const TEXT_VALUE_MAX = 200;
export const NUMBER_ABS_MAX = 1e12;

export type CustomField = {
  id: string;
  name: string;
  type: FieldType;
  options: string[];
  sortOrder: number;
  showInList: boolean;
  hidden: boolean;
};

export type FieldValue = string | number | boolean | string[];

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const needsOptions = (t: FieldType) => t === "select" || t === "multi_select";

/** 項目の定義（追加・編集フォームの入力）を検証する */
export function validateFieldDefinition(
  raw: unknown,
  existingNames: string[] = [],
): Result<{ name: string; type: FieldType; options: string[] | null }> {
  if (typeof raw !== "object" || raw === null)
    return { ok: false, error: "入力が正しくありません" };
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, error: "項目名を入力してください" };
  if ([...name].length > FIELD_NAME_MAX)
    return { ok: false, error: `項目名は${FIELD_NAME_MAX}文字までです` };
  if (
    existingNames.some(
      (n) => n.normalize("NFKC").toLowerCase() === name.normalize("NFKC").toLowerCase(),
    )
  )
    return { ok: false, error: "同じ名前の項目があります" };

  const type = FIELD_TYPES.find((t) => t === r.type);
  if (!type) return { ok: false, error: "種類を選んでください" };

  if (!needsOptions(type)) return { ok: true, value: { name, type, options: null } };

  const list = Array.isArray(r.options) ? r.options : [];
  const options: string[] = [];
  for (const o of list) {
    if (typeof o !== "string") continue;
    const t = o.trim().replace(/\s+/g, " ");
    if (!t) continue;
    if ([...t].length > OPTION_LENGTH_MAX)
      return { ok: false, error: `選択肢は${OPTION_LENGTH_MAX}文字までです` };
    if (!options.includes(t)) options.push(t);
  }
  if (options.length === 0) return { ok: false, error: "選択肢を1つ以上入力してください" };
  if (options.length > OPTION_MAX) return { ok: false, error: `選択肢は${OPTION_MAX}個までです` };
  return { ok: true, value: { name, type, options } };
}

/** 選択肢をテキストエリア（1行1つ）から取り出す */
export function parseOptionsText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * フォームから届いた項目値を、項目の定義に照らして整える。
 * 戻り値のキーは項目ID。値が null のものは「値を消す」の意味（空欄・未チェック）。
 * 定義にない項目ID、型が合わない値は捨てる（保存しない）。
 */
export function sanitizeFieldValues(
  defs: Pick<CustomField, "id" | "type" | "options">[],
  raw: unknown,
): Record<string, FieldValue | null> {
  const out: Record<string, FieldValue | null> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  const input = raw as Record<string, unknown>;

  for (const def of defs) {
    if (!(def.id in input)) continue;
    const v = input[def.id];
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
      out[def.id] = null;
      continue;
    }
    switch (def.type) {
      case "text":
        if (typeof v === "string" && v.trim()) out[def.id] = v.trim().slice(0, TEXT_VALUE_MAX);
        break;
      case "number": {
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        if (Number.isFinite(n) && Math.abs(n) <= NUMBER_ABS_MAX) out[def.id] = n;
        break;
      }
      case "select":
        if (typeof v === "string" && def.options.includes(v)) out[def.id] = v;
        break;
      case "multi_select":
        if (Array.isArray(v)) {
          const picked = def.options.filter((o) => v.includes(o));
          out[def.id] = picked.length > 0 ? picked : null;
        }
        break;
      case "date":
        if (isValidDate(v)) out[def.id] = v;
        break;
      case "checkbox":
        // 未チェックは「値なし」として保存しない
        if (typeof v === "boolean") out[def.id] = v ? true : null;
        break;
    }
  }
  return out;
}

/** 保存済みの値を表示用の文字列にする。値なしは空文字 */
export function formatFieldValue(def: Pick<CustomField, "type">, value: unknown): string {
  if (value === null || value === undefined) return "";
  switch (def.type) {
    case "checkbox":
      return value === true ? "✓" : "";
    case "multi_select":
      return Array.isArray(value) ? value.filter((x) => typeof x === "string").join("・") : "";
    case "number":
      return typeof value === "number" ? String(value) : "";
    default:
      return typeof value === "string" ? value : "";
  }
}

/** 一覧・詳細に出す項目（非表示を除く）を並び順で返す */
export function visibleFields<T extends Pick<CustomField, "hidden" | "sortOrder" | "name">>(
  fields: T[],
): T[] {
  return fields
    .filter((f) => !f.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ja"));
}
