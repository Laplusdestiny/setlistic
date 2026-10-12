import { describe, expect, it } from "vitest";
import { suggestTags } from "./suggest";

const tags = [
  { id: "1", name: "十八番", aliases: ["おはこ"] },
  { id: "2", name: "J-POP" },
  { id: "3", name: "アニソン" },
  { id: "4", name: "ポップス" },
  { id: "5", name: "高音つらい" },
];

describe("suggestTags", () => {
  it("入力が空・空白・# だけなら候補なし", () => {
    expect(suggestTags("", tags)).toEqual({ matches: [], create: null });
    expect(suggestTags("  ", tags)).toEqual({ matches: [], create: null });
    expect(suggestTags("#", tags)).toEqual({ matches: [], create: null });
  });
  it("名前の部分一致（前方一致を先に）", () => {
    expect(suggestTags("ポ", tags).matches.map((t) => t.name)).toEqual(["ポップス"]);
    expect(suggestTags("p", tags).matches.map((t) => t.name)).toEqual(["J-POP"]);
  });
  it("全角半角・大文字小文字を区別しない", () => {
    expect(suggestTags("ｊ－ｐ", tags).matches.map((t) => t.name)).toEqual(["J-POP"]);
    expect(suggestTags("J-pop", tags).matches[0].name).toBe("J-POP");
  });
  it("別名でもヒットする", () => {
    expect(suggestTags("おは", tags).matches.map((t) => t.name)).toEqual(["十八番"]);
  });
  it("先頭の # を取り除いて探す", () => {
    expect(suggestTags("#十八", tags).matches.map((t) => t.name)).toEqual(["十八番"]);
  });
  it("完全一致を最優先にする", () => {
    const list = [
      { id: "a", name: "ロック調" },
      { id: "b", name: "ロック" },
    ];
    expect(suggestTags("ロック", list).matches.map((t) => t.id)).toEqual(["b", "a"]);
  });
  it("件数の上限がある", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `タグ${i}` }));
    expect(suggestTags("タグ", many).matches).toHaveLength(8);
    expect(suggestTags("タグ", many, 3).matches).toHaveLength(3);
  });
  it("新規作成の候補：既存と同名なら出さず、長すぎるものも出さない", () => {
    expect(suggestTags("新しいタグ", tags).create).toBe("新しいタグ");
    expect(suggestTags("＃新しいタグ", tags).create).toBe("新しいタグ");
    expect(suggestTags("ｊ-ｐｏｐ", tags).create).toBeNull();
    expect(suggestTags("十八番", tags).create).toBeNull();
    expect(suggestTags("あ".repeat(31), tags).create).toBeNull();
  });
  it("別名と同じ入力は、既存タグの候補として出し、新規作成は出す（別名はタグ名ではない）", () => {
    const r = suggestTags("おはこ", tags);
    expect(r.matches.map((t) => t.name)).toEqual(["十八番"]);
    expect(r.create).toBe("おはこ");
  });
});
