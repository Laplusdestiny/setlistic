import { describe, expect, it } from "vitest";
import {
  cleanTagName,
  dedupeTagNames,
  normalizeTagName,
  tagNameFromInput,
  validateTagName,
} from "./normalize";

describe("normalizeTagName", () => {
  it("全角半角・大文字小文字・前後空白をそろえる", () => {
    expect(normalizeTagName("  Ｊ－ＰＯＰ ")).toBe(normalizeTagName("j-pop".replace("-", "－")));
    expect(normalizeTagName("ＪＰＯＰ")).toBe("jpop");
    expect(normalizeTagName("  Rock ")).toBe("rock");
    expect(normalizeTagName("ロック")).toBe("ロック");
  });
  it("半角カナは全角カナに寄る（NFKC）", () => {
    expect(normalizeTagName("ﾛｯｸ")).toBe("ロック");
  });
  it("連続空白は1つにする", () => {
    expect(normalizeTagName("a   b")).toBe("a b");
    expect(normalizeTagName("a　b")).toBe("a b");
  });
  it("ひらがなとカタカナは区別する（かな揺れは MVP 対象外）", () => {
    expect(normalizeTagName("ろっく")).not.toBe(normalizeTagName("ロック"));
  });
});

describe("tagNameFromInput / cleanTagName", () => {
  it("先頭の # を取り除く", () => {
    expect(tagNameFromInput("#十八番")).toBe("十八番");
    expect(tagNameFromInput("＃十八番")).toBe("十八番");
    expect(tagNameFromInput("  ##x ")).toBe("x");
  });
  it("表示用は見た目を保つ", () => {
    expect(cleanTagName("  J-POP ")).toBe("J-POP");
  });
});

describe("validateTagName", () => {
  it("空・# だけは空扱い", () => {
    expect(validateTagName("")).toBe("empty");
    expect(validateTagName("  # ")).toBe("empty");
  });
  it("30文字を超えると too_long", () => {
    expect(validateTagName("あ".repeat(30))).toBeNull();
    expect(validateTagName("あ".repeat(31))).toBe("too_long");
  });
});

describe("dedupeTagNames", () => {
  it("正規化後に同じものは先の表記を残して1つにする", () => {
    expect(dedupeTagNames(["J-POP", "j-pop", " ＪＰＯＰ ", "#j-pop", "ロック"])).toEqual([
      "J-POP",
      "ＪＰＯＰ",
      "ロック",
    ]);
  });
  it("空は捨てる", () => {
    expect(dedupeTagNames(["", " ", "#"])).toEqual([]);
  });
});
