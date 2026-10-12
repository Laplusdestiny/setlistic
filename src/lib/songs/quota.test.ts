import { describe, expect, it } from "vitest";
import { parseQuota, quotaFullMessage, quotaStatus } from "./quota";

describe("quotaStatus", () => {
  it("余裕・残り1割以下・上限", () => {
    expect(quotaStatus({ used: 100, max: 2000 })).toEqual({
      remaining: 1900,
      percent: 5,
      level: "ok",
    });
    expect(quotaStatus({ used: 1800, max: 2000 }).level).toBe("near"); // 残り200 = ちょうど1割
    expect(quotaStatus({ used: 1799, max: 2000 }).level).toBe("ok");
    expect(quotaStatus({ used: 2000, max: 2000 })).toEqual({
      remaining: 0,
      percent: 100,
      level: "full",
    });
  });
  it("上限を超えていても残りは0（負にならない）", () => {
    expect(quotaStatus({ used: 2100, max: 2000 })).toMatchObject({
      remaining: 0,
      percent: 100,
      level: "full",
    });
  });
});

describe("parseQuota / message", () => {
  it("DBの応答を読む。壊れた値は null", () => {
    expect(parseQuota({ used: 3, max: 2000 })).toEqual({ used: 3, max: 2000 });
    expect(parseQuota(null)).toBeNull();
    expect(parseQuota({ used: "3", max: 2000 })).toBeNull();
    expect(parseQuota({ used: 3, max: 0 })).toBeNull();
  });
  it("上限のメッセージに数を入れる", () => {
    expect(quotaFullMessage(2000)).toContain("2,000曲");
  });
});
