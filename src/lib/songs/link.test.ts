import { describe, expect, it } from "vitest";
import { songLink } from "./link";

const APPLE = "https://music.apple.com/jp/song/1498176428";
const SPOTIFY = "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh";
const YOUTUBE = "https://music.youtube.com/watch?v=x8VYWazR5mE";

describe("songLink", () => {
  it("Spotify から登録した曲は、登録元のURLを「Spotifyで開く」にする", () => {
    expect(songLink({ appleUrl: null, sourceService: "spotify", sourceUrl: SPOTIFY })).toEqual({
      href: SPOTIFY,
      label: "Spotifyで開く",
    });
  });

  it("YouTube Music から登録した曲は「YouTube Musicで開く」にする", () => {
    expect(
      songLink({ appleUrl: null, sourceService: "youtube_music", sourceUrl: YOUTUBE }),
    ).toEqual({ href: YOUTUBE, label: "YouTube Musicで開く" });
  });

  it("Apple Music の URL も持っていれば、登録元を優先する", () => {
    expect(songLink({ appleUrl: APPLE, sourceService: "spotify", sourceUrl: SPOTIFY })).toEqual({
      href: SPOTIFY,
      label: "Spotifyで開く",
    });
  });

  it.each(["apple_music", "search", "manual", null])(
    "登録元が %s の曲は Apple Music の URL を使う",
    (sourceService) => {
      expect(songLink({ appleUrl: APPLE, sourceService, sourceUrl: APPLE })).toEqual({
        href: APPLE,
        label: "Apple Musicで開く",
      });
    },
  );

  it.each([
    ["サービスと URL が食い違う", "spotify", YOUTUBE],
    ["曲の URL でない", "spotify", "https://open.spotify.com/album/4iV5W9uYEdYUVa79Axb7Rh"],
    ["対応していないサイト", "youtube_music", "https://example.com/watch?v=x8VYWazR5mE"],
    ["URL が無い", "spotify", null],
  ])("登録元の URL が使えない（%s）ときは Apple Music に戻す", (_, sourceService, sourceUrl) => {
    expect(songLink({ appleUrl: APPLE, sourceService, sourceUrl })).toEqual({
      href: APPLE,
      label: "Apple Musicで開く",
    });
  });

  it("どちらの URL も使えなければ null", () => {
    expect(songLink({ appleUrl: null, sourceService: "manual", sourceUrl: null })).toBeNull();
    expect(
      songLink({ appleUrl: null, sourceService: "spotify", sourceUrl: "not a url" }),
    ).toBeNull();
  });
});
