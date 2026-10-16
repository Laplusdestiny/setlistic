import { SORT_KEYS, type SortKey } from "../songs/sort";
import { UUID_PATTERN } from "../songs/validate";

export type TagMode = "and" | "or";
export type LastEase = "easy" | "normal" | "hard" | "not_hard";
export type DurationBucket = "lt3" | "3to4" | "4to5" | "gte5";
export type KeyBucket = "down" | "zero" | "up";

export type SearchConditions = {
  /** フリーワード（空白区切りの語は AND） */
  q: string;
  tagMode: TagMode;
  include: string[];
  exclude: string[];
  artist: string;
  genre: string;
  /** リリース年代（2010 = 2010年代） */
  decades: number[];
  durations: DurationBucket[];
  keys: KeyBucket[];
  lastEase: LastEase | null;
  /** null = 設定の既定の並び順 */
  sort: SortKey | null;
};

export const EMPTY_CONDITIONS: SearchConditions = {
  q: "",
  tagMode: "and",
  include: [],
  exclude: [],
  artist: "",
  genre: "",
  decades: [],
  durations: [],
  keys: [],
  lastEase: null,
  sort: null,
};

export const DURATION_BUCKETS: DurationBucket[] = ["lt3", "3to4", "4to5", "gte5"];
export const KEY_BUCKETS: KeyBucket[] = ["down", "zero", "up"];
export const LAST_EASES: LastEase[] = ["easy", "normal", "hard", "not_hard"];
export const DECADES = [1980, 1990, 2000, 2010, 2020];

export const DURATION_LABELS: Record<DurationBucket, string> = {
  lt3: "3分未満",
  "3to4": "3〜4分",
  "4to5": "4〜5分",
  gte5: "5分以上",
};
export const KEY_LABELS: Record<KeyBucket, string> = {
  down: "キーを下げる",
  zero: "原キー（±0）",
  up: "キーを上げる",
};
export const LAST_EASE_LABELS: Record<LastEase, string> = {
  easy: "最近余裕だった",
  normal: "最近ふつうだった",
  hard: "最近辛かった",
  not_hard: "辛かった曲を除く",
};

export const MAX_WORDS = 5;
export const MAX_WORD_LENGTH = 50;
export const MAX_TAGS_PER_SIDE = 30;

/** 検索用の正規化：NFKC・小文字（DB側の lower(normalize(x, NFKC)) と同じ規則） */
export function normalizeSearchText(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/** フリーワードを語に分ける（全角空白も区切り）。重複除去・長さ/個数の上限あり */
export function splitWords(q: string): string[] {
  const words = normalizeSearchText(q)
    .split(/\s+/)
    .map((w) => w.trim().slice(0, MAX_WORD_LENGTH))
    .filter(Boolean);
  return [...new Set(words)].slice(0, MAX_WORDS);
}

const ids = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(v.filter((x): x is string => typeof x === "string" && UUID_PATTERN.test(x))),
      ].slice(0, MAX_TAGS_PER_SIDE)
    : [];

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(v) ? allowed.filter((a) => v.includes(a)) : [];

const text = (v: unknown, max = 100): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** 信頼できない入力（URL・保存済みJSON・クライアント）を安全な条件に整える */
export function normalizeConditions(raw: unknown): SearchConditions {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const include = ids(r.include);
  // 同じタグを含める・除外の両方に入れない（除外を優先）
  const exclude = ids(r.exclude);
  return {
    q: text(r.q, 200),
    tagMode: r.tagMode === "or" ? "or" : "and",
    include: include.filter((i) => !exclude.includes(i)),
    exclude,
    artist: text(r.artist),
    genre: text(r.genre),
    decades: DECADES.filter((d) => Array.isArray(r.decades) && r.decades.includes(d)),
    durations: pick(r.durations, DURATION_BUCKETS),
    keys: pick(r.keys, KEY_BUCKETS),
    lastEase: LAST_EASES.find((e) => e === r.lastEase) ?? null,
    sort: SORT_KEYS.find((k) => k === r.sort) ?? null,
  };
}

/** 並び順以外に絞り込み条件があるか */
export function hasConditions(c: SearchConditions): boolean {
  return (
    splitWords(c.q).length > 0 ||
    c.include.length > 0 ||
    c.exclude.length > 0 ||
    c.artist !== "" ||
    c.genre !== "" ||
    c.decades.length > 0 ||
    c.durations.length > 0 ||
    c.keys.length > 0 ||
    c.lastEase !== null
  );
}

/** 有効な条件の数（検索画面のボタンの「N個の条件で絞り込む」用）。タグは1つずつ数える */
export function countConditions(c: SearchConditions): number {
  return (
    c.include.length +
    c.exclude.length +
    (splitWords(c.q).length > 0 ? 1 : 0) +
    (c.artist ? 1 : 0) +
    (c.genre ? 1 : 0) +
    (c.decades.length > 0 ? 1 : 0) +
    (c.durations.length > 0 ? 1 : 0) +
    (c.keys.length > 0 ? 1 : 0) +
    (c.lastEase ? 1 : 0)
  );
}

// ───────── URL との相互変換 ─────────

type Params = Pick<URLSearchParams, "get">;

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function conditionsFromParams(sp: Params): SearchConditions {
  return normalizeConditions({
    q: sp.get("q") ?? "",
    tagMode: sp.get("m"),
    include: list(sp.get("t")),
    exclude: list(sp.get("x")),
    artist: sp.get("artist") ?? "",
    genre: sp.get("genre") ?? "",
    decades: list(sp.get("dec")).map(Number),
    durations: list(sp.get("len")),
    keys: list(sp.get("key")),
    lastEase: sp.get("ease"),
    sort: sp.get("sort"),
  });
}

/** 既定値は省略して短いURLにする */
export function conditionsToParams(c: SearchConditions): URLSearchParams {
  const p = new URLSearchParams();
  if (c.q) p.set("q", c.q);
  if (c.include.length) p.set("t", c.include.join(","));
  if (c.exclude.length) p.set("x", c.exclude.join(","));
  if (c.tagMode === "or") p.set("m", "or");
  if (c.artist) p.set("artist", c.artist);
  if (c.genre) p.set("genre", c.genre);
  if (c.decades.length) p.set("dec", c.decades.join(","));
  if (c.durations.length) p.set("len", c.durations.join(","));
  if (c.keys.length) p.set("key", c.keys.join(","));
  if (c.lastEase) p.set("ease", c.lastEase);
  if (c.sort) p.set("sort", c.sort);
  return p;
}

export function conditionsToHref(c: SearchConditions, path = "/"): string {
  const s = conditionsToParams(c).toString();
  return s ? `${path}?${s}` : path;
}

// ───────── DB 関数 search_songs への引数 ─────────

type Range = { min?: number; max?: number };

/** 曲の長さ（ミリ秒） */
const DURATION_RANGES: Record<DurationBucket, Range> = {
  lt3: { max: 179_999 },
  "3to4": { min: 180_000, max: 239_999 },
  "4to5": { min: 240_000, max: 299_999 },
  gte5: { min: 300_000 },
};

const KEY_RANGES: Record<KeyBucket, Range> = {
  down: { max: -1 },
  zero: { min: 0, max: 0 },
  up: { min: 1 },
};

export type SearchRpcParams = {
  words: string[];
  tag_mode: TagMode;
  tag_include: string[];
  tag_exclude: string[];
  artist: string | null;
  genre: string | null;
  decades: number[];
  duration_ranges: Range[];
  key_ranges: Range[];
  last_ease: LastEase | null;
  sort: SortKey;
};

/** 検索条件 → DB関数の引数。並び順の既定（設定値）は呼び出し側が渡す */
export function toRpcParams(c: SearchConditions, defaultSort: SortKey): SearchRpcParams {
  return {
    words: splitWords(c.q),
    tag_mode: c.tagMode,
    tag_include: c.include,
    tag_exclude: c.exclude,
    artist: c.artist ? normalizeSearchText(c.artist) : null,
    genre: c.genre ? normalizeSearchText(c.genre) : null,
    decades: c.decades,
    duration_ranges: c.durations.map((d) => DURATION_RANGES[d]),
    key_ranges: c.keys.map((k) => KEY_RANGES[k]),
    last_ease: c.lastEase,
    sort: c.sort ?? defaultSort,
  };
}

// ───────── 表示用の説明 ─────────

/** 条件を日本語の短い句にする（絞り込み中の表示・保存した条件の副題用） */
export function describeConditions(
  c: SearchConditions,
  tagName: (id: string) => string | undefined,
): string[] {
  const out: string[] = [];
  const tags = (xs: string[]) => xs.flatMap((id) => (tagName(id) ? [`#${tagName(id)}`] : []));

  const words = splitWords(c.q);
  if (words.length) out.push(`キーワード「${words.join(" ")}」`);

  const inc = tags(c.include);
  if (inc.length) out.push(inc.join(c.tagMode === "or" && inc.length > 1 ? " または " : " かつ "));
  const exc = tags(c.exclude);
  if (exc.length) out.push(`${exc.join(" ")} を除く`);

  if (c.artist) out.push(`アーティスト「${c.artist}」`);
  if (c.genre) out.push(`ジャンル「${c.genre}」`);
  if (c.decades.length) out.push(c.decades.map((d) => `${d}年代`).join("・"));
  if (c.durations.length) out.push(c.durations.map((d) => DURATION_LABELS[d]).join("・"));
  if (c.keys.length) out.push(c.keys.map((k) => KEY_LABELS[k]).join("・"));
  if (c.lastEase) out.push(LAST_EASE_LABELS[c.lastEase]);
  return out;
}

/** タグのチップを押したときの切り替え：なし → 含める → 除外 → なし */
export function cycleTag(c: SearchConditions, id: string): SearchConditions {
  if (c.include.includes(id)) {
    return { ...c, include: c.include.filter((x) => x !== id), exclude: [...c.exclude, id] };
  }
  if (c.exclude.includes(id)) {
    return { ...c, exclude: c.exclude.filter((x) => x !== id) };
  }
  return { ...c, include: [...c.include, id] };
}

export type TagState = "include" | "exclude" | "none";
export function tagState(c: SearchConditions, id: string): TagState {
  return c.include.includes(id) ? "include" : c.exclude.includes(id) ? "exclude" : "none";
}

/** 配列から1件をランダムに選ぶ（rng は 0以上1未満。テストで差し替える） */
export function pickRandom<T>(items: readonly T[], rng: () => number = Math.random): T | null {
  if (items.length === 0) return null;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * ランダム演出（スロット）の切り替え間隔（ミリ秒）。後ろほど長くなり、合計が total になる。
 * count 個の間隔を返す（count + 1 個の候補を順に出すときの、候補どうしの間）
 */
export function slotIntervals(count: number, total: number): number[] {
  if (count <= 0) return [];
  // 1 + 4t² の重みで減速させる（最後の間隔は最初の5倍）
  const weights = Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return 1 + 4 * t * t;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * total);
}

/**
 * ランダム演出で順に出す候補の列。長さ length で、最後は winner。
 * 候補が2件以上あれば、同じものが続けて出ない
 */
export function slotSequence<T>(
  items: readonly T[],
  winner: T,
  length: number,
  rng: () => number = Math.random,
): T[] {
  if (length <= 0) return [];
  const seq: T[] = [winner];
  // 当選から逆向きに、直後と違うものを選んで前に足していく
  while (seq.length < length) {
    const next = seq[0];
    const rest = items.filter((x) => x !== next);
    seq.unshift(pickRandom(rest, rng) ?? next);
  }
  return seq;
}
