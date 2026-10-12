import { isValidDate } from "../format";
import { UUID_PATTERN } from "./validate";

export const NOTE_MAX = 200;

export type SingLogPayload = {
  songId: string;
  sungAt: string;
  ease: number | null;
  note: string | null;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** 「今日歌った！」の入力検証。歌った日は今日以前、歌いやすさは1〜5（任意） */
export function toSingLogPayload(raw: unknown, today: string): Result<SingLogPayload> {
  if (typeof raw !== "object" || raw === null)
    return { ok: false, error: "リクエストが正しくありません" };
  const r = raw as Record<string, unknown>;

  if (typeof r.songId !== "string" || !UUID_PATTERN.test(r.songId))
    return { ok: false, error: "曲が見つかりません" };

  const sungAt = r.sungAt === undefined || r.sungAt === "" ? today : r.sungAt;
  if (!isValidDate(sungAt)) return { ok: false, error: "日付が正しくありません" };
  if (sungAt > today) return { ok: false, error: "未来の日付は記録できません" };

  let ease: number | null = null;
  if (r.ease !== undefined && r.ease !== null && r.ease !== "") {
    if (typeof r.ease !== "number" || !Number.isInteger(r.ease) || r.ease < 1 || r.ease > 5)
      return { ok: false, error: "歌いやすさは1〜5で選んでください" };
    ease = r.ease;
  }

  const note = typeof r.note === "string" ? r.note.trim().slice(0, NOTE_MAX) : "";
  return { ok: true, value: { songId: r.songId, sungAt, ease, note: note || null } };
}
