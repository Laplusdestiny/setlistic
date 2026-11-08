import { describe, expect, it } from "vitest";
import { extractSharedUrl } from "./shared-url";

describe("extractSharedUrl", () => {
  it("url をそのまま返す", () => {
    expect(extractSharedUrl({ url: "https://music.apple.com/jp/song/x/1" })).toBe(
      "https://music.apple.com/jp/song/x/1",
    );
  });
  it("url が空なら text の中のURLを使う（Android）", () => {
    expect(extractSharedUrl({ text: "曲名 https://open.spotify.com/track/abc?si=z 聴いて" })).toBe(
      "https://open.spotify.com/track/abc?si=z",
    );
  });
  it("text にも無ければ title を見る", () => {
    expect(extractSharedUrl({ title: "https://youtu.be/abc" })).toBe("https://youtu.be/abc");
  });
  it("二重エンコードを戻す", () => {
    expect(
      extractSharedUrl({ url: "https%3A%2F%2Fmusic.youtube.com%2Fwatch%3Fv%3Da%26si%3Db" }),
    ).toBe("https://music.youtube.com/watch?v=a&si=b");
  });
  it("壊れたエンコード・URLでない値はそのまま返す", () => {
    expect(extractSharedUrl({ url: "https%3A%2F%2F%E0%A4%A" })).toBe("https%3A%2F%2F%E0%A4%A");
    expect(extractSharedUrl({ url: "abc", si: "b" })).toBe("abc");
  });
  it("切れたパラメーターを付け直す", () => {
    expect(extractSharedUrl({ url: "https://music.youtube.com/watch?v=a", si: "b" })).toBe(
      "https://music.youtube.com/watch?v=a&si=b",
    );
    expect(extractSharedUrl({ url: "https://open.spotify.com/track/a", si: "b" })).toBe(
      "https://open.spotify.com/track/a?si=b",
    );
  });
  it("何も無ければ空、長すぎれば2000文字で切る", () => {
    expect(extractSharedUrl({})).toBe("");
    expect(extractSharedUrl({ url: "https://a.com/" + "x".repeat(3000) })).toHaveLength(2000);
  });
});
