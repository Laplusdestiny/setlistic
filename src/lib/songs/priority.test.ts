import { describe, expect, it } from "vitest";
import { parsePriority, PRIORITIES, PRIORITY_FILTER_LABELS, PRIORITY_LABELS } from "./priority";

describe("parsePriority", () => {
  it("1・2・3 の数値だけを通す", () => {
    expect(parsePriority(1)).toBe(1);
    expect(parsePriority(2)).toBe(2);
    expect(parsePriority(3)).toBe(3);
  });
  it("それ以外は null", () => {
    for (const v of [0, 4, 1.5, "1", "高", null, undefined]) expect(parsePriority(v)).toBeNull();
  });
});

describe("ラベル", () => {
  it("全ての優先度にラベルがある", () => {
    expect(PRIORITIES.map((p) => PRIORITY_LABELS[p])).toEqual(["高", "中", "低"]);
    expect(PRIORITY_FILTER_LABELS).toEqual({ high: "高だけ", mid: "中以上", set: "設定あり" });
  });
});
