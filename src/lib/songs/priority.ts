/** 練習の優先度（1=高・2=中・3=低。未設定は null） */
export type Priority = 1 | 2 | 3;

export const PRIORITIES: readonly Priority[] = [1, 2, 3];

export const PRIORITY_LABELS: Record<Priority, string> = { 1: "高", 2: "中", 3: "低" };

/** 1・2・3 の数値だけを通し、それ以外は null */
export function parsePriority(v: unknown): Priority | null {
  return PRIORITIES.find((p) => p === v) ?? null;
}

/** 検索の絞り込み：高だけ／中以上／設定あり */
export type PriorityFilter = "high" | "mid" | "set";

export const PRIORITY_FILTERS: PriorityFilter[] = ["high", "mid", "set"];

export const PRIORITY_FILTER_LABELS: Record<PriorityFilter, string> = {
  high: "高だけ",
  mid: "中以上",
  set: "設定あり",
};
