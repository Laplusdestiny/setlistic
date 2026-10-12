import { describe, expect, it } from "vitest";
import { formatDateJa, formatDateShort, formatDuration, isValidDate, todayJst } from "./format";

describe("todayJst", () => {
  it("UTC の夕方は日本ではもう翌日", () => {
    expect(todayJst(new Date("2026-10-12T16:00:00Z"))).toBe("2026-10-13");
    expect(todayJst(new Date("2026-10-12T14:59:00Z"))).toBe("2026-10-12");
  });
});

describe("formatDateJa / formatDateShort", () => {
  it("日本語表記", () => {
    expect(formatDateJa("2026-01-05")).toBe("2026年1月5日");
    expect(formatDateJa(null)).toBe("");
    expect(formatDateJa("bad")).toBe("");
  });
  it("今年は月/日、それ以外は年付き", () => {
    expect(formatDateShort("2026-10-12", "2026-11-01")).toBe("10/12");
    expect(formatDateShort("2025-10-12", "2026-11-01")).toBe("2025/10/12");
  });
});

describe("isValidDate", () => {
  it("実在する日付だけ通す", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-2-3")).toBe(false);
    expect(isValidDate(20260101)).toBe(false);
  });
});

describe("formatDuration", () => {
  it("分:秒", () => {
    expect(formatDuration(261013)).toBe("4:21");
    expect(formatDuration(59000)).toBe("0:59");
    expect(formatDuration(null)).toBe("");
  });
});
