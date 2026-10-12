import { describe, expect, it } from "vitest";
import { KARAOKE_GROUP_NAME, KARAOKE_TAG_NAMES, planKaraokeTags } from "./karaoke";

describe("planKaraokeTags", () => {
  it("何もなければ、グループと DAM・JOYSOUND の両方を作る", () => {
    expect(planKaraokeTags([], [])).toEqual({
      groupName: KARAOKE_GROUP_NAME,
      groupId: null,
      names: [...KARAOKE_TAG_NAMES],
    });
  });

  it("同名のグループがあればそこに入れる", () => {
    const groups = [{ id: "g1", name: "カラオケ機種" }];
    expect(planKaraokeTags(groups, []).groupId).toBe("g1");
  });

  it("正規化後に同じ名前のタグがあれば作らない（グループは問わない）", () => {
    const tags = [{ name: "ｄａｍ" }, { name: "十八番" }];
    expect(planKaraokeTags([], tags).names).toEqual(["JOYSOUND"]);
  });

  it("両方あれば作るものはない", () => {
    expect(planKaraokeTags([], [{ name: "DAM" }, { name: "joysound" }]).names).toEqual([]);
  });
});
