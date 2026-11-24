import { describe, expect, it } from "vitest";
import { sameSongKey } from "./bulk";

describe("sameSongKey", () => {
  it("Apple Music は国が違っても同じ曲なら同じキー", () => {
    expect(sameSongKey("https://music.apple.com/jp/song/x/1")).toBe("apple:1");
    expect(sameSongKey("https://music.apple.com/us/album/x/9?i=1")).toBe("apple:1");
  });

  it("Spotify・YouTube Music は追跡パラメータを落とした URL", () => {
    const url = "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh";
    expect(sameSongKey(`${url}?si=abc`)).toBe(url);
    expect(sameSongKey("https://youtu.be/x8VYWazR5mE?si=1")).toBe(
      "https://music.youtube.com/watch?v=x8VYWazR5mE",
    );
  });

  it("曲の URL として読めなければ null（重複の印は付けない）", () => {
    expect(sameSongKey("not a url")).toBeNull();
    expect(sameSongKey("https://open.spotify.com/album/4iV5W9uYEdYUVa79Axb7Rh")).toBeNull();
  });
});
