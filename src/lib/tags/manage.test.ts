import { describe, expect, it } from "vitest";
import { moveItem, validateAlias, validateGroupName, validateRename } from "./manage";

const tags = [
  { id: "1", name: "十八番" },
  { id: "2", name: "J-POP" },
  { id: "3", name: "バラード" },
];

describe("validateRename", () => {
  it("新しい名前を返す（# は外す）", () => {
    expect(validateRename(" #得意 ", "1", tags)).toEqual({
      ok: true,
      value: { name: "得意", normalized: "得意" },
    });
  });
  it("自分自身と同じ名前（大文字小文字だけの変更）は通る", () => {
    expect(validateRename("j-pop", "2", tags).ok).toBe(true);
  });
  it("他のタグと正規化後に同じなら拒否し、統合を案内する", () => {
    const r = validateRename("ｊ－ｐｏｐ", "1", tags);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("統合");
  });
  it("空・長すぎは拒否", () => {
    expect(validateRename("  ", "1", tags).ok).toBe(false);
    expect(validateRename("あ".repeat(31), "1", tags).ok).toBe(false);
  });
});

describe("validateAlias", () => {
  const tag = tags[0];
  it("通常の別名", () => {
    expect(validateAlias("おはこ", tag, tags, [])).toEqual({
      ok: true,
      value: { alias: "おはこ", normalized: "おはこ" },
    });
  });
  it("自分のタグ名・既存タグ名・既存の別名・上限は拒否", () => {
    expect(validateAlias("十八番", tag, tags, []).ok).toBe(false);
    expect(validateAlias("バラード", tag, tags, []).ok).toBe(false);
    expect(validateAlias("ＯＨＡＫＯ", tag, tags, ["ohako"]).ok).toBe(false);
    expect(
      validateAlias(
        "x",
        tag,
        tags,
        Array.from({ length: 10 }, (_, i) => `a${i}`),
      ).ok,
    ).toBe(false);
  });
});

describe("validateGroupName", () => {
  it("正常・空・長すぎ・重複", () => {
    expect(validateGroupName(" シーン ", [])).toEqual({ ok: true, value: "シーン" });
    expect(validateGroupName(" ", []).ok).toBe(false);
    expect(validateGroupName("あ".repeat(21), []).ok).toBe(false);
    expect(validateGroupName("シーン", [{ id: "g", name: "シーン" }]).ok).toBe(false);
    expect(validateGroupName("シーン", [{ id: "g", name: "シーン" }], "g").ok).toBe(true);
  });
});

describe("moveItem", () => {
  const xs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("上下に動かす。端では変わらない", () => {
    expect(moveItem(xs, "b", -1).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(moveItem(xs, "b", 1).map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(moveItem(xs, "a", -1)).toBe(xs);
    expect(moveItem(xs, "c", 1)).toBe(xs);
    expect(moveItem(xs, "zz", 1)).toBe(xs);
  });
  it("元の配列を変更しない", () => {
    moveItem(xs, "b", -1);
    expect(xs.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
