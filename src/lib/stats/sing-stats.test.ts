import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import {
  buildChart,
  EMPTY_STATS,
  getSingStats,
  parseRange,
  parseSingStats,
  rangeHref,
  rangeLabel,
} from "./sing-stats";

const TODAY = "2026-10-24";
const r = (period: string, today = TODAY) => parseRange({ period }, today);
const custom = (from: string, to: string, today = TODAY) =>
  parseRange({ period: "custom", from, to }, today);

describe("parseRange", () => {
  it("知らない値・未指定は今年", () => {
    expect(r("week")).toEqual({ period: "year", from: "2026-01-01", to: TODAY });
    expect(parseRange({}, TODAY).period).toBe("year");
    expect(parseRange({ period: ["all"] }, TODAY).period).toBe("year");
  });

  it("今日は今日だけ、今月は1日から、今年は1月1日から、全期間は始まりなし。終わりは今日", () => {
    expect(r("today")).toEqual({ period: "today", from: TODAY, to: TODAY });
    expect(r("month")).toEqual({ period: "month", from: "2026-10-01", to: TODAY });
    expect(r("year")).toEqual({ period: "year", from: "2026-01-01", to: TODAY });
    expect(r("all")).toEqual({ period: "all", from: null, to: TODAY });
  });

  it("期間を指定：開始日と終了日をそのまま使う", () => {
    expect(custom("2026-03-01", "2026-04-15")).toEqual({
      period: "custom",
      from: "2026-03-01",
      to: "2026-04-15",
    });
  });

  it("期間を指定：逆なら入れ替え、未来は今日にそろえる", () => {
    expect(custom("2026-04-15", "2026-03-01")).toMatchObject({
      from: "2026-03-01",
      to: "2026-04-15",
    });
    expect(custom("2026-10-01", "2027-01-01")).toMatchObject({ from: "2026-10-01", to: TODAY });
    expect(custom("2027-01-01", "2027-02-01")).toMatchObject({ from: TODAY, to: TODAY });
  });

  it("期間を指定：日付が読めなければ今年", () => {
    for (const [from, to] of [
      ["2026-02-30", "2026-03-01"],
      ["x", "2026-03-01"],
      ["2026-03-01", ""],
    ])
      expect(custom(from, to).period).toBe("year");
    expect(
      parseRange({ period: "custom", from: ["2026-01-01"], to: "2026-02-01" }, TODAY).period,
    ).toBe("year");
  });
});

describe("rangeLabel / rangeHref", () => {
  it("決まった期間は名前、指定した期間は日付で表す（今年でなければ年も付ける）", () => {
    expect(rangeLabel(r("today"), TODAY)).toBe("今日");
    expect(rangeLabel(r("month"), TODAY)).toBe("今月");
    expect(rangeLabel(r("all"), TODAY)).toBe("全期間");
    expect(rangeLabel(custom("2026-03-01", "2026-04-15"), TODAY)).toBe("3月1日〜4月15日");
    expect(rangeLabel(custom("2026-03-01", "2026-03-01"), TODAY)).toBe("3月1日");
    expect(rangeLabel(custom("2025-12-20", "2026-01-05"), TODAY)).toBe(
      "2025年12月20日〜2026年1月5日",
    );
    expect(rangeLabel(custom("2025-03-01", "2025-04-15"), TODAY)).toBe("2025年3月1日〜4月15日");
  });

  it("期間の切り替えのリンク。今年は ?period= なし、期間を指定は今月1日〜今日から始める", () => {
    expect(rangeHref("year", TODAY)).toBe("/stats");
    expect(rangeHref("today", TODAY)).toBe("/stats?period=today");
    expect(rangeHref("custom", TODAY)).toBe("/stats?period=custom&from=2026-10-01&to=2026-10-24");
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
  it("期間の始まり・終わりと今日を渡して集計を受け取る", async () => {
    const sb = fakeSupabase({ rpc: { sing_stats: { data: { summary: { logs: 5 } } } } });
    const s = await getSingStats(sb.client as never, custom("2026-03-01", "2026-04-15"), TODAY);
    expect(s.summary.logs).toBe(5);
    expect(sb.client.rpc).toHaveBeenCalledWith("sing_stats", {
      p_from: "2026-03-01",
      p_to: "2026-04-15",
      p_today: TODAY,
    });
  });

  it("失敗したら空の集計", async () => {
    const sb = fakeSupabase({ rpc: { sing_stats: { error: { message: "x" } } } });
    expect(await getSingStats(sb.client as never, r("all"), TODAY)).toEqual(EMPTY_STATS);
  });
});

describe("buildChart", () => {
  it("今日・今月はグラフを出さない", () => {
    expect(buildChart([{ month: "2026-10", logs: 2 }], r("today"), TODAY)).toBeNull();
    expect(
      buildChart([{ month: "2026-10", logs: 2 }], r("month", "2026-10-24"), "2026-10-24"),
    ).toBeNull();
  });

  it("今年は1月〜今月を、記録のない月も0で並べる", () => {
    const c = buildChart(
      [
        { month: "2026-02", logs: 1 },
        { month: "2026-10", logs: 2 },
      ],
      r("year", "2026-10-24"),
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
    const c = buildChart([{ month: "2025-11", logs: 4 }], r("all", "2026-02-01"), "2026-02-01");
    expect(c?.points.map((p) => [p.key, p.label, p.year])).toEqual([
      ["2025-11", "11月", "2025"],
      ["2025-12", "12月", undefined],
      ["2026-01", "1月", "2026"],
      ["2026-02", "2月", undefined],
    ]);
  });

  it("13か月以上なら目盛りを3か月おきに間引く", () => {
    const c = buildChart([{ month: "2025-01", logs: 1 }], r("all", "2026-03-10"), "2026-03-10");
    expect(c?.points).toHaveLength(15);
    expect(c?.points.filter((p) => p.label).map((p) => p.key)).toEqual([
      "2025-01",
      "2025-04",
      "2025-07",
      "2025-10",
      "2026-01",
    ]);
    // 最初の月は、間引く月でも目盛りを出す（年の区切りと並べるため）
    const late = buildChart([{ month: "2025-06", logs: 1 }], r("all", "2026-10-24"), "2026-10-24");
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
      r("all", "2026-10-24"),
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

  it("期間を指定：開始月〜終了月を並べる。1か月に収まればグラフなし。年をまたげば年を付ける", () => {
    const c = buildChart(
      [{ month: "2026-03", logs: 2 }],
      custom("2026-02-10", "2026-04-15"),
      TODAY,
    );
    expect(c?.points.map((p) => [p.key, p.count, p.year])).toEqual([
      ["2026-02", 0, undefined],
      ["2026-03", 2, undefined],
      ["2026-04", 0, undefined],
    ]);
    expect(buildChart([], custom("2026-03-01", "2026-03-31"), TODAY)).toBeNull();
    const span = buildChart([], custom("2025-11-01", "2026-01-31"), TODAY);
    expect(span?.points.map((p) => p.year)).toEqual(["2025", undefined, "2026"]);
  });

  it("全期間で記録がなければグラフなし", () => {
    expect(buildChart([], r("all", "2026-10-24"), "2026-10-24")).toBeNull();
  });
});
