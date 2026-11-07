import { describe, expect, it } from "vitest";
import { restoreSharedUrl } from "./shared-url";

describe("restoreSharedUrl", () => {
  it("url が無ければ空", () => {
    expect(restoreSharedUrl({})).toBe("");
    expect(restoreSharedUrl({ url: "" })).toBe("");
  });

  it("エンコード済みの URL はそのまま", () => {
    const u = "https://open.spotify.com/track/abc?si=x&y=1";
    expect(restoreSharedUrl({ url: u })).toBe(u);
  });

  it("未エンコードの & で切れた分を付け直す", () => {
    expect(
      restoreSharedUrl({ url: "https://music.youtube.com/watch?v=abc", si: "xyz", a: ["1", "2"] }),
    ).toBe("https://music.youtube.com/watch?v=abc&si=xyz&a=1&a=2");
    expect(restoreSharedUrl({ url: "https://example.com/song", si: "x", flag: "" })).toBe(
      "https://example.com/song?si=x&flag",
    );
  });

  it("二重エンコードは一度戻す。戻せなければそのまま", () => {
    expect(restoreSharedUrl({ url: "https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fabc%3Fsi%3Dx" })).toBe(
      "https://open.spotify.com/track/abc?si=x",
    );
    expect(restoreSharedUrl({ url: "https%3A%E0%A4%A" })).toBe("https%3A%E0%A4%A");
  });

  it("url が複数あれば最初の値を使い、長すぎるときは切る", () => {
    expect(restoreSharedUrl({ url: ["https://a.example/1", "https://b.example/2"] })).toBe(
      "https://a.example/1",
    );
    expect(restoreSharedUrl({ url: "x".repeat(3000) })).toHaveLength(2000);
  });
});
