import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// 振り返りページ（Issue #1）の期間・集計結果・グラフの並び。集計そのものは DB 関数 sing_stats が行う

export const PERIODS = ["month", "year", "all"] as const;
export type StatsPeriod = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<StatsPeriod, string> = {
  month: "今月",
  year: "今年",
  all: "全期間",
};

/** URL の ?period= を読む。知らない値・未指定は「今年」 */
export function parsePeriod(raw: unknown): StatsPeriod {
  return PERIODS.includes(raw as StatsPeriod) ? (raw as StatsPeriod) : "year";
}

/** 期間の始まり（YYYY-MM-DD）。全期間は null。today は日本時間の今日 */
export function periodStart(period: StatsPeriod, today: string): string | null {
  if (period === "month") return `${today.slice(0, 7)}-01`;
  if (period === "year") return `${today.slice(0, 4)}-01-01`;
  return null;
}

export type StatsSong = {
  id: string;
  title: string;
  artist: string;
  count: number;
  lastSungAt: string;
};

export type SingStats = {
  summary: { logs: number; songs: number; days: number; firstTimes: number };
  monthly: { month: string; logs: number }[];
  top: StatsSong[];
  dormant: StatsSong[];
  tags: { id: string; name: string; count: number; songs: number }[];
  artists: { artist: string; count: number; songs: number }[];
};

export const EMPTY_STATS: SingStats = {
  summary: { logs: 0, songs: 0, days: 0, firstTimes: 0 },
  monthly: [],
  top: [],
  dormant: [],
  tags: [],
  artists: [],
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "object" && x !== null) : [];

function toSong(r: Record<string, unknown>): StatsSong {
  return {
    id: str(r.id),
    title: str(r.title),
    artist: str(r.artist),
    count: num(r.count),
    lastSungAt: str(r.lastSungAt),
  };
}

/** DB 関数の戻り値（jsonb）を画面で使う形にする。欠けた値は 0・空にそろえる */
export function parseSingStats(data: unknown): SingStats {
  if (typeof data !== "object" || data === null) return EMPTY_STATS;
  const d = data as Record<string, unknown>;
  const s = (typeof d.summary === "object" && d.summary !== null ? d.summary : {}) as Record<
    string,
    unknown
  >;
  return {
    summary: {
      logs: num(s.logs),
      songs: num(s.songs),
      days: num(s.days),
      firstTimes: num(s.firstTimes),
    },
    monthly: list(d.monthly).map((m) => ({ month: str(m.month), logs: num(m.logs) })),
    top: list(d.top).map(toSong),
    dormant: list(d.dormant).map(toSong),
    tags: list(d.tags).map((t) => ({
      id: str(t.id),
      name: str(t.name),
      count: num(t.count),
      songs: num(t.songs),
    })),
    artists: list(d.artists).map((a) => ({
      artist: str(a.artist),
      count: num(a.count),
      songs: num(a.songs),
    })),
  };
}

/** 集計を取得する。失敗したときは空の集計（画面は「記録がありません」になる） */
export async function getSingStats(
  supabase: Client,
  period: StatsPeriod,
  today: string,
): Promise<SingStats> {
  const { data, error } = await supabase.rpc("sing_stats", {
    p_from: periodStart(period, today),
    p_today: today,
  });
  return error ? EMPTY_STATS : parseSingStats(data);
}

export type ChartPoint = {
  /** YYYY-MM または YYYY */
  key: string;
  /** 軸の目盛り（「10月」「2026年」）。間引いた目盛りは空文字 */
  label: string;
  /** 年の区切り（全期間の月ごとで、最初の月と1月にだけ付ける「2026」） */
  year?: string;
  /** 読み上げ用の名前（「2026年10月」） */
  name: string;
  count: number;
};

/** 全期間で、月ごとに並べるのはここまで。超えたら年ごとにまとめる */
export const MAX_MONTH_BARS = 24;

const addMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * グラフの棒の並び。記録のない月も 0 で埋める。
 * - 今年：1月〜今月
 * - 全期間：最初に記録した月〜今月（24か月を超えたら年ごと）
 * - 今月：棒は1本だけになるのでグラフは出さない（null）
 */
export function buildChart(
  monthly: SingStats["monthly"],
  period: StatsPeriod,
  today: string,
): { unit: "month" | "year"; points: ChartPoint[] } | null {
  if (period === "month") return null;
  const thisMonth = today.slice(0, 7);
  const counts = new Map(monthly.map((m) => [m.month, m.logs]));
  const first =
    period === "year" ? `${today.slice(0, 4)}-01` : monthly.map((m) => m.month).sort()[0];
  if (!first || first > thisMonth) return null;

  const months: string[] = [];
  for (let ym = first; ym <= thisMonth; ym = addMonth(ym)) months.push(ym);

  if (months.length > MAX_MONTH_BARS) {
    const years = new Map<string, number>();
    for (const ym of months)
      years.set(ym.slice(0, 4), (years.get(ym.slice(0, 4)) ?? 0) + (counts.get(ym) ?? 0));
    return {
      unit: "year",
      points: [...years].map(([y, count]) => ({ key: y, label: `${y}年`, name: `${y}年`, count })),
    };
  }

  // 13か月以上並ぶときは、目盛りを最初の月と3か月おき（1・4・7・10月）に間引く。最初の月のすぐ隣は詰まるので出さない
  const crowded = months.length > 12;
  return {
    unit: "month",
    points: months.map((ym, i) => {
      const [y, m] = [ym.slice(0, 4), Number(ym.slice(5))];
      const point: ChartPoint = {
        key: ym,
        label: !crowded || i === 0 || ((m - 1) % 3 === 0 && i !== 1) ? `${m}月` : "",
        name: `${y}年${m}月`,
        count: counts.get(ym) ?? 0,
      };
      if (period === "all" && (i === 0 || m === 1)) point.year = y;
      return point;
    }),
  };
}
