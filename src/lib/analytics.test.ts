import { describe, expect, it } from "vitest";
import { redactAnalyticsUrl } from "./analytics";

const ORIGIN = "https://setlistic.laplusdestiny.com";

describe("redactAnalyticsUrl", () => {
  it.each([
    [
      "クエリを落とす",
      `${ORIGIN}/add?url=https%3A%2F%2Fmusic.apple.com%2Fjp%2Fsong%2F1`,
      `${ORIGIN}/add`,
    ],
    [
      "認可コードを落とす",
      `${ORIGIN}/auth/callback?code=secret&next=%2F`,
      `${ORIGIN}/auth/callback`,
    ],
    ["# 以降を落とす", `${ORIGIN}/help#releases`, `${ORIGIN}/help`],
    [
      "曲の ID を伏せる",
      `${ORIGIN}/songs/11111111-2222-4333-8444-555555555555?edit=1`,
      `${ORIGIN}/songs/[id]`,
    ],
    ["そのままでよい URL は変えない", `${ORIGIN}/search`, `${ORIGIN}/search`],
    ["トップ", `${ORIGIN}/`, `${ORIGIN}/`],
  ])("%s", (_, input, expected) => {
    expect(redactAnalyticsUrl(input)).toBe(expected);
  });

  it("絶対 URL でなくても、クエリと ID を落とす", () => {
    expect(redactAnalyticsUrl("/songs/11111111-2222-4333-8444-555555555555?edit=1#x")).toBe(
      "/songs/[id]",
    );
  });
});
