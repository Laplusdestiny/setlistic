import { describe, expect, it } from "vitest";
import {
  formatFieldValue,
  parseOptionsText,
  sanitizeFieldValues,
  validateFieldDefinition,
  visibleFields,
  type CustomField,
} from "./custom-fields";

describe("validateFieldDefinition", () => {
  it("名前と種類が正しければ通る（選択肢なしの型は options が null）", () => {
    expect(validateFieldDefinition({ name: " 最高点 ", type: "number" })).toEqual({
      ok: true,
      value: { name: "最高点", type: "number", options: null },
    });
  });
  it("選択肢は trim・重複排除・空行除去。1つ以上必要", () => {
    expect(
      validateFieldDefinition({
        name: "機種",
        type: "select",
        options: [" DAM ", "DAM", "", "JOYSOUND"],
      }),
    ).toEqual({
      ok: true,
      value: { name: "機種", type: "select", options: ["DAM", "JOYSOUND"] },
    });
    expect(validateFieldDefinition({ name: "機種", type: "select", options: [] }).ok).toBe(false);
    expect(
      validateFieldDefinition({ name: "機種", type: "multi_select", options: ["", "  "] }).ok,
    ).toBe(false);
  });
  it("名前の空・長すぎ・重複（全角半角・大文字小文字を同一視）を拒否", () => {
    expect(validateFieldDefinition({ name: "  ", type: "text" }).ok).toBe(false);
    expect(validateFieldDefinition({ name: "あ".repeat(31), type: "text" }).ok).toBe(false);
    expect(validateFieldDefinition({ name: "ＤＡＭ", type: "text" }, ["dam"]).ok).toBe(false);
  });
  it("不正な種類・入力を拒否", () => {
    expect(validateFieldDefinition({ name: "x", type: "color" }).ok).toBe(false);
    expect(validateFieldDefinition(null).ok).toBe(false);
  });
  it("選択肢が長すぎる・多すぎる場合を拒否", () => {
    expect(
      validateFieldDefinition({ name: "x", type: "select", options: ["あ".repeat(31)] }).ok,
    ).toBe(false);
    expect(
      validateFieldDefinition({
        name: "x",
        type: "select",
        options: Array.from({ length: 21 }, (_, i) => `o${i}`),
      }).ok,
    ).toBe(false);
  });
});

describe("parseOptionsText", () => {
  it("1行1つ。空行・前後空白を除く", () => {
    expect(parseOptionsText(" DAM \r\n\nJOYSOUND\n")).toEqual(["DAM", "JOYSOUND"]);
  });
});

describe("sanitizeFieldValues", () => {
  const defs = [
    { id: "t", type: "text", options: [] },
    { id: "n", type: "number", options: [] },
    { id: "s", type: "select", options: ["DAM", "JOYSOUND"] },
    { id: "m", type: "multi_select", options: ["盛り上げ", "締め", "しっとり"] },
    { id: "d", type: "date", options: [] },
    { id: "c", type: "checkbox", options: [] },
  ] as const;
  const f = (raw: unknown) => sanitizeFieldValues(defs as never, raw);

  it("型どおりの値はそのまま（数値文字列は数値にする）", () => {
    expect(
      f({ t: " メモ ", n: "92.5", s: "DAM", m: ["締め", "盛り上げ"], d: "2026-01-05", c: true }),
    ).toEqual({
      t: "メモ",
      n: 92.5,
      s: "DAM",
      m: ["盛り上げ", "締め"], // 定義の順
      d: "2026-01-05",
      c: true,
    });
  });
  it("空欄・未チェックは null（値を消す）", () => {
    expect(f({ t: "", n: null, s: "", m: [], c: false })).toEqual({
      t: null,
      n: null,
      s: null,
      m: null,
      c: null,
    });
  });
  it("型や選択肢が合わない値は捨てる", () => {
    expect(f({ t: 5, n: "abc", s: "SEGA", m: ["x"], d: "2026-02-30", c: "yes" })).toEqual({
      m: null,
    });
  });
  it("定義にない項目IDは無視し、渡されなかった項目は含めない（触らない）", () => {
    expect(f({ unknown: "x", t: "a" })).toEqual({ t: "a" });
  });
  it("極端な数値・長すぎるテキストを制限", () => {
    expect(f({ n: 1e20 })).toEqual({});
    expect(f({ t: "あ".repeat(500) }).t).toHaveLength(200);
  });
  it("配列やnullなど不正な入力全体でも例外にしない", () => {
    expect(f(null)).toEqual({});
    expect(f([1, 2])).toEqual({});
  });
});

describe("formatFieldValue / visibleFields", () => {
  it("表示用の文字列", () => {
    expect(formatFieldValue({ type: "checkbox" }, true)).toBe("✓");
    expect(formatFieldValue({ type: "multi_select" }, ["a", "b"])).toBe("a・b");
    expect(formatFieldValue({ type: "number" }, 92)).toBe("92");
    expect(formatFieldValue({ type: "text" }, null)).toBe("");
  });
  it("非表示を除き、並び順で返す", () => {
    const fields = [
      { name: "b", hidden: false, sortOrder: 2 },
      { name: "a", hidden: false, sortOrder: 1 },
      { name: "h", hidden: true, sortOrder: 0 },
    ] as CustomField[];
    expect(visibleFields(fields).map((x) => x.name)).toEqual(["a", "b"]);
  });
});
