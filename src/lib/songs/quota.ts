export type Quota = { used: number; max: number };

export type QuotaStatus = {
  remaining: number;
  percent: number;
  /** ok：余裕あり／near：残りが1割以下／full：上限に達した */
  level: "ok" | "near" | "full";
};

export function quotaStatus({ used, max }: Quota): QuotaStatus {
  const remaining = Math.max(0, max - used);
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 100;
  const level = remaining === 0 ? "full" : remaining <= max * 0.1 ? "near" : "ok";
  return { remaining, percent, level };
}

export const quotaFullMessage = (max: number) =>
  `登録できる曲数の上限（${max.toLocaleString("ja-JP")}曲）に達しました。不要な曲を削除すると、また登録できます。`;

/** DB の song_quota() の応答を安全に読む。壊れた値は null */
export function parseQuota(raw: unknown): Quota | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { used, max } = raw as Record<string, unknown>;
  return typeof used === "number" &&
    typeof max === "number" &&
    Number.isFinite(used) &&
    Number.isFinite(max) &&
    max > 0
    ? { used, max }
    : null;
}
