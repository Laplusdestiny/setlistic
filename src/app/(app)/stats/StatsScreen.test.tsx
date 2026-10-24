// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EMPTY_STATS, type SingStats } from "@/lib/stats/sing-stats";
import { StatsScreen } from "./StatsScreen";

const TODAY = "2026-10-24";

const stats: SingStats = {
  summary: { logs: 1234, songs: 2, days: 2, firstTimes: 1 },
  monthly: [
    { month: "2026-02", logs: 1 },
    { month: "2026-10", logs: 2 },
  ],
  top: [
    { id: "s1", title: "夜に駆ける", artist: "YOASOBI", count: 2, lastSungAt: "2026-10-03" },
    { id: "s2", title: "群青", artist: "YOASOBI", count: 1, lastSungAt: "2026-10-03" },
  ],
  dormant: [
    {
      id: "s3",
      title: "丸の内サディスティック",
      artist: "椎名林檎",
      count: 3,
      lastSungAt: "2025-06-10",
    },
  ],
  tags: [{ id: "t1", name: "十八番", count: 3, songs: 1 }],
  artists: [{ artist: "YOASOBI", count: 3, songs: 2 }],
};

describe("StatsScreen", () => {
  it("期間のまとめ・月ごとのグラフ・よく歌った曲・ご無沙汰の曲を出す", () => {
    render(<StatsScreen period="year" today={TODAY} stats={stats} />);
    const summary = screen.getByRole("region", { name: "今年のまとめ" });
    expect(summary).toHaveTextContent("歌った回数1,234回");
    expect(summary).toHaveTextContent("カラオケに行った日2日");
    expect(summary).toHaveTextContent("初めて歌った曲1曲");

    // グラフは読み上げ用の表で中身を確かめる（1月〜10月）
    const chart = screen.getByRole("region", { name: "月ごとの歌った回数" });
    const rows = within(chart).getAllByRole("row");
    expect(rows).toHaveLength(10);
    expect(rows[1]).toHaveTextContent("2026年2月1回");

    const top = screen.getByRole("region", { name: "よく歌った曲" });
    expect(
      within(top)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["/songs/s1", "/songs/s2"]);
    expect(top).toHaveTextContent("2回");
    expect(top).toHaveTextContent("最後 10/3");

    const dormant = screen.getByRole("region", { name: "ご無沙汰の曲" });
    expect(dormant).toHaveTextContent("これまで3回");
    expect(dormant).toHaveTextContent("最後 2025/6/10");
  });

  it("今いる期間に印を付け、今年は ?period= なしのリンク", () => {
    render(<StatsScreen period="month" today={TODAY} stats={stats} />);
    const nav = screen.getByRole("navigation", { name: "期間" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["今月", "/stats?period=month"],
      ["今年", "/stats"],
      ["全期間", "/stats?period=all"],
    ]);
    expect(within(nav).getByRole("link", { current: "page" })).toHaveTextContent("今月");
    // 今月は棒が1本になるのでグラフを出さない
    expect(screen.queryByRole("region", { name: /歌った回数$/ })).toBeNull();
  });

  it("全期間が長ければ年ごとのグラフ。13本以上なら棒の上の数は出さない", () => {
    const { unmount } = render(
      <StatsScreen
        period="all"
        today={TODAY}
        stats={{ ...stats, monthly: [{ month: "2020-01", logs: 5 }] }}
      />,
    );
    const years = screen.getByRole("region", { name: "年ごとの歌った回数" });
    expect(within(years).getAllByRole("row")).toHaveLength(7);
    expect(years.querySelector("[aria-hidden] span span")).toHaveTextContent("5");
    unmount();

    render(
      <StatsScreen
        period="all"
        today={TODAY}
        stats={{ ...stats, monthly: [{ month: "2025-06", logs: 5 }] }}
      />,
    );
    const months = screen.getByRole("region", { name: "月ごとの歌った回数" });
    expect(within(months).getAllByRole("row")).toHaveLength(17);
    // 年の区切り（最初の月と1月）
    expect(months).toHaveTextContent("2025");
    expect(months).toHaveTextContent("2026");
    expect(months.querySelector("[aria-hidden] span span")).toBeNull();
  });

  it("タグ別・アーティスト別は「詳しく見る」を開いたときに見える", () => {
    render(<StatsScreen period="year" today={TODAY} stats={stats} />);
    const more = screen.getByText("タグ別・アーティスト別に詳しく見る").closest("details")!;
    expect(more.open).toBe(false);
    expect(within(more).getByRole("region", { name: "タグ別" })).toHaveTextContent(
      "十八番3回（1曲）",
    );
    expect(within(more).getByRole("region", { name: "アーティスト別" })).toHaveTextContent(
      "YOASOBI3回（2曲）",
    );
  });

  it("記録がなければ案内を出し、グラフ・よく歌った曲・詳しく見るは出さない", () => {
    render(<StatsScreen period="year" today={TODAY} stats={EMPTY_STATS} />);
    expect(screen.getByText(/今年の歌唱記録はまだありません/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "月ごとの歌った回数" })).toBeNull();
    expect(screen.queryByRole("region", { name: "よく歌った曲" })).toBeNull();
    expect(screen.queryByText(/詳しく見る/)).toBeNull();
    expect(screen.getByRole("region", { name: "ご無沙汰の曲" })).toHaveTextContent(
      "いまはありません。",
    );
  });

  it("片方だけ集計があれば、もう片方は「ありません」", () => {
    render(<StatsScreen period="year" today={TODAY} stats={{ ...stats, tags: [] }} />);
    expect(screen.getByRole("region", { name: "タグ別" })).toHaveTextContent("ありません。");
  });
});
