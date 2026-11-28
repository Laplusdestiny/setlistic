import { describe, expect, it } from "vitest";
import { planSingable } from "./singable";

const tag = (id: string, name: string) => ({ id, name });
const all = [tag("t1", "十八番"), tag("t2", "歌える"), tag("t3", "練習中"), tag("t4", "歌いたい")];

describe("planSingable", () => {
  it("練習中が付いていれば、外して歌えるを付ける案を返す", () => {
    expect(planSingable([tag("t3", "練習中"), tag("x", "アニソン")], all)).toEqual({
      remove: [tag("t3", "練習中")],
      add: { tagId: "t2" },
    });
  });

  it("歌いたいも対象。両方付いていれば両方外す", () => {
    expect(planSingable([tag("t4", "歌いたい"), tag("t3", "練習中")], all)?.remove).toEqual([
      tag("t4", "歌いたい"),
      tag("t3", "練習中"),
    ]);
  });

  it("タグ名は正規化して比べる（全角・半角や前後の空白）", () => {
    expect(planSingable([tag("t3", " 練習中 ")], [tag("t2", "歌える ")])).toEqual({
      remove: [tag("t3", " 練習中 ")],
      add: { tagId: "t2" },
    });
  });

  it("どちらも付いていなければ null（ダイアログを出さない）", () => {
    expect(planSingable([tag("t1", "十八番"), tag("t2", "歌える")], all)).toBeNull();
    expect(planSingable([], all)).toBeNull();
  });

  it("歌えるのタグが無ければ、歌える度グループに作り直す", () => {
    expect(planSingable([tag("t3", "練習中")], [tag("t3", "練習中")])).toEqual({
      remove: [tag("t3", "練習中")],
      add: { newTag: { name: "歌える", group: "歌える度" } },
    });
  });
});
