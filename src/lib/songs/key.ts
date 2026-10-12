export const KEY_MIN = -7;
export const KEY_MAX = 7;

export function clampKey(n: number): number {
  return Math.min(KEY_MAX, Math.max(KEY_MIN, Math.trunc(n)));
}

/** 0 は「±0」、正は「+2」、負は「-2」 */
export function formatKey(key: number | null | undefined): string {
  if (key === null || key === undefined) return "";
  if (key === 0) return "±0";
  return key > 0 ? `+${key}` : String(key);
}
