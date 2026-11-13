import { describe, expect, it } from "vitest";
import { opensSameTrack, songArtwork } from "./artwork";

const ART =
  "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/6e/67/51/x/193428105461.jpg/100x100bb.jpg";
const APPLE = "https://music.apple.com/jp/album/rhapsody/1440833100?i=1440833102&uo=4";

describe("songArtwork", () => {
  it("Apple の画像 URL と曲 URL がそろえば、大きめの画像とバッジのリンク先を返す", () => {
    expect(songArtwork({ artworkUrl: ART, appleUrl: APPLE })).toEqual({
      src: "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/6e/67/51/x/193428105461.jpg/300x300bb.jpg",
      href: "https://music.apple.com/jp/song/1440833102",
      trackId: 1440833102,
    });
  });

  it("末尾が大きさの形でない URL はそのまま使う", () => {
    const src = "https://is1-ssl.mzstatic.com/image/thumb/x/cover.jpg";
    expect(songArtwork({ artworkUrl: src, appleUrl: APPLE })?.src).toBe(src);
  });

  it.each([
    ["無い", null],
    ["URL でない", "ジャケット"],
    ["https でない", ART.replace("https:", "http:")],
    ["Apple の画像サーバーでない", "https://example.com/100x100bb.jpg"],
    ["ホスト名が似ているだけ", "https://evilmzstatic.com/100x100bb.jpg"],
  ])("画像 URL が%sときは出さない", (_, artworkUrl) => {
    expect(songArtwork({ artworkUrl, appleUrl: APPLE })).toBeNull();
  });

  it.each([
    ["無い", null],
    ["Apple Music の曲でない", "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"],
    ["アルバムの URL", "https://music.apple.com/jp/album/rhapsody/1440833100"],
  ])("バッジのリンク先にする曲 URL が%sときは出さない", (_, appleUrl) => {
    expect(songArtwork({ artworkUrl: ART, appleUrl })).toBeNull();
  });
});

describe("opensSameTrack", () => {
  const artwork = songArtwork({ artworkUrl: ART, appleUrl: APPLE })!;

  it("同じ曲の Apple Music の URL なら true（国や URL の形が違ってもよい）", () => {
    expect(opensSameTrack(APPLE, artwork)).toBe(true);
    expect(opensSameTrack("https://music.apple.com/us/song/1440833102", artwork)).toBe(true);
  });

  it("別の曲・別のサービス・読めない URL は false", () => {
    expect(opensSameTrack("https://music.apple.com/jp/song/1", artwork)).toBe(false);
    expect(opensSameTrack("https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh", artwork)).toBe(
      false,
    );
    expect(opensSameTrack("", artwork)).toBe(false);
  });
});
