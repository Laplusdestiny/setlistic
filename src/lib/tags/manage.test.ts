import { describe, expect, it } from "vitest";
import { moveItem, placeItem, validateAlias, validateGroupName, validateRename } from "./manage";

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

describe("placeItem", () => {
  const xs = [
    { id: "a", groupId: "g1" },
    { id: "x", groupId: "g2" },
    { id: "b", groupId: "g1" },
    { id: "c", groupId: "g1" },
    { id: "y", groupId: null },
  ];
  const ids = (items: { id: string }[]) => items.map((x) => x.id);
  const inGroup = (items: typeof xs, g: string | null) => ids(items.filter((x) => x.groupId === g));

  it("同じグループの中で位置を変える", () => {
    expect(inGroup(placeItem(xs, "c", "g1", 0), "g1")).toEqual(["c", "a", "b"]);
    expect(inGroup(placeItem(xs, "a", "g1", 1), "g1")).toEqual(["b", "a", "c"]);
    expect(inGroup(placeItem(xs, "a", "g1", 2), "g1")).toEqual(["b", "c", "a"]);
    expect(inGroup(placeItem(xs, "a", "g1", 99), "g1")).toEqual(["b", "c", "a"]);
  });
  it("別のグループへ移して、その位置に入れる", () => {
    const next = placeItem(xs, "b", "g2", 0);
    expect(next.find((x) => x.id === "b")?.groupId).toBe("g2");
    expect(inGroup(next, "g2")).toEqual(["b", "x"]);
    expect(inGroup(next, "g1")).toEqual(["a", "c"]);
    expect(inGroup(placeItem(xs, "b", null, 1), null)).toEqual(["y", "b"]);
  });
  it("タグのないグループへ移せる", () => {
    const next = placeItem(xs, "a", "g3", 0);
    expect(inGroup(next, "g3")).toEqual(["a"]);
    expect(next).toHaveLength(xs.length);
  });
  it("知らない id なら変えない。元の配列は変更しない", () => {
    expect(placeItem(xs, "zz", "g1", 0)).toBe(xs);
    placeItem(xs, "a", "g2", 0);
    expect(xs[0]).toEqual({ id: "a", groupId: "g1" });
  });
});
