import { describe, expect, it } from "vitest";
import { toSingLogPayload } from "./sing-log";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const TODAY = "2026-10-12";

describe("toSingLogPayload", () => {
  it("日付省略なら今日、歌いやすさ・メモは任意", () => {
    expect(toSingLogPayload({ songId: ID }, TODAY)).toEqual({
      ok: true,
      value: { songId: ID, sungAt: TODAY, ease: null, note: null },
    });
  });
  it("入力値をそのまま通す（メモは trim）", () => {
    const r = toSingLogPayload(
      { songId: ID, sungAt: "2026-10-01", ease: 4, note: " 高音きつい " },
      TODAY,
    );
    expect(r).toEqual({
      ok: true,
      value: { songId: ID, sungAt: "2026-10-01", ease: 4, note: "高音きつい" },
    });
  });
  it("未来の日付・不正な日付は拒否", () => {
    expect(toSingLogPayload({ songId: ID, sungAt: "2026-10-13" }, TODAY).ok).toBe(false);
    expect(toSingLogPayload({ songId: ID, sungAt: "2026-02-30" }, TODAY).ok).toBe(false);
    expect(toSingLogPayload({ songId: ID, sungAt: "yesterday" }, TODAY).ok).toBe(false);
  });
  it("歌いやすさは1〜5の整数だけ", () => {
    for (const ease of [0, 6, 2.5, "3", NaN]) {
      expect(toSingLogPayload({ songId: ID, ease }, TODAY).ok).toBe(false);
    }
    expect(toSingLogPayload({ songId: ID, ease: 1 }, TODAY).ok).toBe(true);
    expect(toSingLogPayload({ songId: ID, ease: 5 }, TODAY).ok).toBe(true);
  });
  it("曲IDがUUIDでなければ拒否", () => {
    expect(toSingLogPayload({ songId: "x" }, TODAY).ok).toBe(false);
    expect(toSingLogPayload(null, TODAY).ok).toBe(false);
  });
  it("長すぎるメモは切り詰める", () => {
    const r = toSingLogPayload({ songId: ID, note: "あ".repeat(500) }, TODAY);
    expect(r.ok && [...(r.value.note ?? "")].length).toBe(200);
  });
});
