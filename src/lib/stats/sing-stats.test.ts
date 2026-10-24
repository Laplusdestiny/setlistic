import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import {
  buildChart,
  EMPTY_STATS,
  getSingStats,
  parsePeriod,
  parseSingStats,
  periodStart,
} from "./sing-stats";

describe("parsePeriod / periodStart", () => {
  it("知らない値・未指定は今年", () => {
    expect(parsePeriod("month")).toBe("month");
    expect(parsePeriod("all")).toBe("all");
    expect(parsePeriod("week")).toBe("year");
    expect(parsePeriod(undefined)).toBe("year");
    expect(parsePeriod(["all"])).toBe("year");
  });

  it("今月は1日から、今年は1月1日から、全期間は始まりなし", () => {
    expect(periodStart("month", "2026-10-24")).toBe("2026-10-01");
    expect(periodStart("year", "2026-10-24")).toBe("2026-01-01");
    expect(periodStart("all", "2026-10-24")).toBeNull();
  });
});

describe("parseSingStats", () => {
  it("DB の戻り値を画面の形にする", () => {
    const s = parseSingStats({
      summary: { logs: 3, songs: 2, days: 2, firstTimes: 1 },
      monthly: [{ month: "2026-10", logs: 3 }],
      top: [{ id: "s1", title: "群青", artist: "YOASOBI", count: 2, lastSungAt: "2026-10-03" }],
      dormant: [],
      tags: [{ id: "t1", name: "十八番", count: 3, songs: 1 }],
      artists: [{ artist: "YOASOBI", count: 3, songs: 2 }],
    });
    expect(s.summary).toEqual({ logs: 3, songs: 2, days: 2, firstTimes: 1 });
    expect(s.top[0]).toEqual({
      id: "s1",
      title: "群青",
      artist: "YOASOBI",
      count: 2,
      lastSungAt: "2026-10-03",
    });
    expect(s.tags[0].name).toBe("十八番");
    expect(s.artists[0].songs).toBe(2);
  });

  it("形が違えば 0・空にそろえる", () => {
    expect(parseSingStats(null)).toEqual(EMPTY_STATS);
    expect(parseSingStats("x")).toEqual(EMPTY_STATS);
    const s = parseSingStats({ summary: null, top: [null, { title: 1 }], monthly: "x" });
    expect(s.summary).toEqual(EMPTY_STATS.summary);
    expect(s.monthly).toEqual([]);
    expect(s.top).toEqual([{ id: "", title: "", artist: "", count: 0, lastSungAt: "" }]);
  });
});

describe("getSingStats", () => {
  it("期間の始まりと今日を渡して集計を受け取る", async () => {
    const sb = fakeSupabase({ rpc: { sing_stats: { data: { summary: { logs: 5 } } } } });
    const s = await getSingStats(sb.client as never, "year", "2026-10-24");
    expect(s.summary.logs).toBe(5);
    expect(sb.client.rpc).toHaveBeenCalledWith("sing_stats", {
      p_from: "2026-01-01",
      p_today: "2026-10-24",
    });
  });

  it("失敗したら空の集計", async () => {
    const sb = fakeSupabase({ rpc: { sing_stats: { error: { message: "x" } } } });
    expect(await getSingStats(sb.client as never, "all", "2026-10-24")).toEqual(EMPTY_STATS);
  });
});

describe("buildChart", () => {
  it("今月はグラフを出さない", () => {
    expect(buildChart([{ month: "2026-10", logs: 2 }], "month", "2026-10-24")).toBeNull();
  });

  it("今年は1月〜今月を、記録のない月も0で並べる", () => {
    const c = buildChart(
      [
        { month: "2026-02", logs: 1 },
        { month: "2026-10", logs: 2 },
      ],
      "year",
      "2026-10-24",
    );
    expect(c?.unit).toBe("month");
    expect(c?.points).toHaveLength(10);
    expect(c?.points[0]).toEqual({ key: "2026-01", label: "1月", name: "2026年1月", count: 0 });
    expect(c?.points[1].count).toBe(1);
    expect(c?.points[9]).toMatchObject({ key: "2026-10", label: "10月", count: 2 });
    expect(c?.points.some((p) => p.year)).toBe(false);
  });

  it("全期間は最初に記録した月から。年の変わり目に年を付ける", () => {
    const c = buildChart([{ month: "2025-11", logs: 4 }], "all", "2026-02-01");
    expect(c?.points.map((p) => [p.key, p.label, p.year])).toEqual([
      ["2025-11", "11月", "2025"],
      ["2025-12", "12月", undefined],
      ["2026-01", "1月", "2026"],
      ["2026-02", "2月", undefined],
    ]);
  });

  it("13か月以上なら目盛りを3か月おきに間引く", () => {
    const c = buildChart([{ month: "2025-01", logs: 1 }], "all", "2026-03-10");
    expect(c?.points).toHaveLength(15);
    expect(c?.points.filter((p) => p.label).map((p) => p.key)).toEqual([
      "2025-01",
      "2025-04",
      "2025-07",
      "2025-10",
      "2026-01",
    ]);
    // 最初の月は、間引く月でも目盛りを出す（年の区切りと並べるため）
    const late = buildChart([{ month: "2025-06", logs: 1 }], "all", "2026-10-24");
    expect(late?.points.filter((p) => p.label).map((p) => p.key)).toEqual([
      "2025-06",
      "2025-10",
      "2026-01",
      "2026-04",
      "2026-07",
      "2026-10",
    ]);
  });

  it("24か月を超えたら年ごとにまとめる", () => {
    const c = buildChart(
      [
        { month: "2023-05", logs: 2 },
        { month: "2023-12", logs: 1 },
        { month: "2026-01", logs: 4 },
      ],
      "all",
      "2026-10-24",
    );
    expect(c?.unit).toBe("year");
    expect(c?.points.map((p) => [p.label, p.count])).toEqual([
      ["2023年", 3],
      ["2024年", 0],
      ["2025年", 0],
      ["2026年", 4],
    ]);
  });

  it("全期間で記録がなければグラフなし", () => {
    expect(buildChart([], "all", "2026-10-24")).toBeNull();
  });
});
