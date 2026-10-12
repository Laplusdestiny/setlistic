const JST = "Asia/Tokyo";

/** 今日の日付（日本時間）を YYYY-MM-DD で返す。DB の current_date は UTC なのでアプリ側で決める */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: JST }).format(now);
}

/** YYYY-MM-DD → 「2026年10月12日」。不正な値は空文字 */
export function formatDateJa(date: string | null | undefined): string {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 一覧向けの短い形式：「10/12」。今年でなければ「2025/10/12」 */
export function formatDateShort(
  date: string | null | undefined,
  today: string = todayJst(),
): string {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const md = `${Number(m[2])}/${Number(m[3])}`;
  return m[1] === today.slice(0, 4) ? md : `${m[1]}/${md}`;
}

export function isValidDate(date: unknown): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** 曲の長さ（ミリ秒）→「4:21」 */
export function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== "number" || ms <= 0) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
