import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// 振り返りページ（Issue #1）の期間・集計結果・グラフの並び。集計そのものは DB 関数 sing_stats が行う

export const PERIODS = ["today", "month", "year", "all", "custom"] as const;
export type StatsPeriod = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<StatsPeriod, string> = {
  today: "今日",
  month: "今月",
  year: "今年",
  all: "全期間",
  custom: "期間を指定",
};

/** 集計する期間（YYYY-MM-DD）。from が null なら始まりなし（全期間）。to は終わりの日（その日を含む） */
export type StatsRange = { period: StatsPeriod; from: string | null; to: string };

type Params = Record<string, string | string[] | undefined>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** 実在する日付（YYYY-MM-DD）か。2月30日などは通さない */
const isDate = (v: unknown): v is string =>
  typeof v === "string" &&
  DATE.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const monthStart = (today: string) => `${today.slice(0, 7)}-01`;

/**
 * URL の ?period=（と期間を指定のときの ?from= ?to=）を読む。知らない値・未指定・読めない日付は「今年」。
 * 期間を指定：開始日が終了日より後なら入れ替え、未来の日は今日にそろえる（Issue #68）。today は日本時間の今日
 */
export function parseRange(params: Params, today: string): StatsRange {
  const p = params.period;
  switch (p) {
    case "today":
      return { period: "today", from: today, to: today };
    case "month":
      return { period: "month", from: monthStart(today), to: today };
    case "all":
      return { period: "all", from: null, to: today };
    case "custom": {
      const { from, to } = params;
      if (!isDate(from) || !isDate(to)) break;
      const [a, b] = [from, to].map((d) => (d > today ? today : d)).sort();
      return { period: "custom", from: a, to: b };
    }
  }
  return { period: "year", from: `${today.slice(0, 4)}-01-01`, to: today };
}

/** 「3月1日」。年が今年（today の年）でなければ「2025年3月1日」 */
function formatDay(d: string, withYear: boolean): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${withYear ? `${y}年` : ""}${m}月${day}日`;
}

/** 見出し・案内に使う期間の名前。期間を指定したときは「3月1日〜4月15日」（年をまたぐ・今年でなければ年も付ける） */
export function rangeLabel(range: StatsRange, today: string): string {
  if (range.period !== "custom" || !range.from) return PERIOD_LABELS[range.period];
  const { from, to } = range;
  const thisYear = today.slice(0, 4);
  const spans = from.slice(0, 4) !== to.slice(0, 4);
  const first = formatDay(from, spans || from.slice(0, 4) !== thisYear);
  if (from === to) return first;
  return `${first}〜${formatDay(to, spans)}`;
}

/** 期間の切り替えのリンク。今年は ?period= なし。期間を指定は、今月1日〜今日から始める */
export function rangeHref(period: StatsPeriod, today: string): string {
  if (period === "year") return "/stats";
  if (period === "custom") return `/stats?period=custom&from=${monthStart(today)}&to=${today}`;
  return `/stats?period=${period}`;
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
  range: StatsRange,
  today: string,
): Promise<SingStats> {
  const { data, error } = await supabase.rpc("sing_stats", {
    p_from: range.from,
    p_to: range.to,
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
 * - 期間を指定：開始月〜終了月
 * - 今日・今月、1か月に収まる期間：棒は1本だけになるのでグラフは出さない（null）
 */
export function buildChart(
  monthly: SingStats["monthly"],
  range: StatsRange,
  today: string,
): { unit: "month" | "year"; points: ChartPoint[] } | null {
  const { period } = range;
  if (period === "today" || period === "month") return null;
  const last = period === "custom" ? range.to.slice(0, 7) : today.slice(0, 7);
  const counts = new Map(monthly.map((m) => [m.month, m.logs]));
  const first =
    period === "year"
      ? `${today.slice(0, 4)}-01`
      : period === "custom"
        ? range.from?.slice(0, 7)
        : monthly.map((m) => m.month).sort()[0];
  if (!first || first > last || (period === "custom" && first === last)) return null;
  // 年の区切り（「2026」）は、全期間と、年をまたぐ指定の期間に付ける
  const markYears = period === "all" || first.slice(0, 4) !== last.slice(0, 4);

  const months: string[] = [];
  for (let ym = first; ym <= last; ym = addMonth(ym)) months.push(ym);

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
      if (markYears && (i === 0 || m === 1)) point.year = y;
      return point;
    }),
  };
}
