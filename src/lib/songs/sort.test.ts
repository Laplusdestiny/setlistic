import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, orderSpecs, parseSort, SORT_KEYS, SORT_LABELS } from "./sort";

describe("parseSort", () => {
  it("有効な値はそのまま、無効な値は既定にする", () => {
    expect(parseSort("title_asc")).toBe("title_asc");
    expect(parseSort("drop table")).toBe(DEFAULT_SORT);
    expect(parseSort(undefined)).toBe(DEFAULT_SORT);
    expect(parseSort(["title_asc"])).toBe(DEFAULT_SORT);
  });
  it("fallback を指定できる（設定の既定値）", () => {
    expect(parseSort(undefined, "title_asc")).toBe("title_asc");
    expect(parseSort("bad", "artist_asc")).toBe("artist_asc");
  });
  it("全キーにラベルがある", () => {
    for (const k of SORT_KEYS) expect(SORT_LABELS[k]).toBeTruthy();
  });
});

describe("orderSpecs", () => {
  it("最近追加順は created_at の新しい順", () => {
    expect(orderSpecs("created_desc")).toEqual([{ column: "created_at", ascending: false }]);
  });
  it("最近歌っていない順は未歌唱を先頭、そのあと古い順", () => {
    expect(orderSpecs("last_sung_asc")[0]).toEqual({
      column: "last_sung_at",
      ascending: true,
      nullsFirst: true,
    });
  });
  it("歌った回数は多い順", () => {
    expect(orderSpecs("sung_count_desc")[0]).toEqual({ column: "sung_count", ascending: false });
  });
  it("全キーが created_at で終わる（同順位の並びを安定させる）", () => {
    for (const k of SORT_KEYS) {
      expect(orderSpecs(k).at(-1)?.column).toBe("created_at");
    }
  });
});

describe("priority_asc", () => {
  it("優先度の高い順（未設定は最後）、同順位は新しい順", () => {
    expect(orderSpecs("priority_asc")).toEqual([
      { column: "practice_priority", ascending: true, nullsFirst: false },
      { column: "created_at", ascending: false },
    ]);
    expect(SORT_LABELS.priority_asc).toBe("練習の優先度が高い順");
  });
});
