import { describe, expect, it } from "vitest";
import { parseMusicUrl } from "./apple-url";

const ok = (input: string) => {
  const r = parseMusicUrl(input);
  if (!r.ok) throw new Error(`expected ok but got ${r.reason}`);
  if (r.service !== "apple_music") throw new Error(`expected apple_music but got ${r.service}`);
  return r;
};

describe("parseMusicUrl: Apple Music", () => {
  it("album URL + ?i= から曲IDを取り出す", () => {
    const r = ok(
      "https://music.apple.com/jp/album/%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B/1498176420?i=1498176428",
    );
    expect(r).toMatchObject({ service: "apple_music", trackId: 1498176428, country: "jp" });
  });

  it("song URL から曲IDを取り出す", () => {
    const r = ok(
      "https://music.apple.com/jp/song/%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B/1498176428",
    );
    expect(r).toMatchObject({ trackId: 1498176428, country: "jp" });
  });

  it("名前なしの song URL", () => {
    expect(ok("https://music.apple.com/us/song/1498176428")).toMatchObject({
      trackId: 1498176428,
      country: "us",
    });
  });

  it("国コード違いを吸収し、小文字にそろえる", () => {
    expect(ok("https://music.apple.com/US/album/x/1?i=2").country).toBe("us");
    expect(ok("https://music.apple.com/gb/song/x/3").country).toBe("gb");
  });

  it("追加クエリ（l, uo など）と順序違いを吸収", () => {
    expect(ok("https://music.apple.com/jp/album/x/1?l=en-US&i=22&uo=4").trackId).toBe(22);
    expect(ok("https://music.apple.com/jp/album/x/1?uo=4&i=22").trackId).toBe(22);
  });

  it("末尾スラッシュ・フラグメント", () => {
    expect(ok("https://music.apple.com/jp/song/x/33/").trackId).toBe(33);
    expect(ok("https://music.apple.com/jp/album/x/1/?i=44#top").trackId).toBe(44);
  });

  it("共有テキストに混ざったURL・前後の空白を拾う", () => {
    const r = ok("  夜に駆ける - YOASOBI\nhttps://music.apple.com/jp/song/x/55 \n");
    expect(r.trackId).toBe(55);
  });

  it("http・embed・geo ホスト・旧 itunes.apple.com 形式", () => {
    expect(ok("http://music.apple.com/jp/song/x/66").trackId).toBe(66);
    expect(ok("https://embed.music.apple.com/jp/album/x/1?i=77").trackId).toBe(77);
    expect(ok("https://geo.music.apple.com/jp/album/x/id1?i=88").trackId).toBe(88);
    expect(ok("https://itunes.apple.com/jp/album/x/id1?i=99").trackId).toBe(99);
  });

  it("国コードが無い場合は country を null にする", () => {
    expect(ok("https://music.apple.com/song/x/12").country).toBeNull();
  });

  it("正規化したURLを返す（追跡パラメータを落とす）", () => {
    expect(ok("https://music.apple.com/jp/album/x/1?i=22&uo=4&l=ja").canonicalUrl).toBe(
      "https://music.apple.com/jp/song/22",
    );
  });
});

describe("parseMusicUrl: 失敗ケース", () => {
  it.each([
    ["", "empty"],
    ["   \n ", "empty"],
    ["ただの文章です", "not_url"],
    ["not a url", "not_url"],
  ])("%j → %s", (input, reason) => {
    expect(parseMusicUrl(input)).toEqual({ ok: false, reason });
  });

  it("アルバムのみ（曲IDなし）", () => {
    expect(parseMusicUrl("https://music.apple.com/jp/album/x/1498176420")).toEqual({
      ok: false,
      reason: "album_only",
    });
  });

  it("曲ではない Apple Music のURL（アーティスト・プレイリスト）", () => {
    expect(parseMusicUrl("https://music.apple.com/jp/artist/x/123")).toEqual({
      ok: false,
      reason: "not_song",
    });
    expect(parseMusicUrl("https://music.apple.com/jp/playlist/x/pl.abc")).toEqual({
      ok: false,
      reason: "not_song",
    });
  });

  it("?i= が数字でない", () => {
    expect(parseMusicUrl("https://music.apple.com/jp/album/x/1?i=abc")).toEqual({
      ok: false,
      reason: "album_only",
    });
  });

  it("Amazon Music は unsupported_service として判別", () => {
    expect(parseMusicUrl("https://music.amazon.co.jp/albums/B0?trackAsin=B1")).toEqual({
      ok: false,
      reason: "unsupported_service",
      service: "amazon_music",
    });
  });

  it("無関係なドメイン", () => {
    expect(parseMusicUrl("https://example.com/jp/song/x/1")).toEqual({
      ok: false,
      reason: "unsupported_service",
      service: null,
    });
  });

  it("music.apple.com を名乗る偽ドメインは通さない", () => {
    expect(parseMusicUrl("https://music.apple.com.evil.example/jp/song/x/1").ok).toBe(false);
    expect(parseMusicUrl("https://evilmusic.apple.com/jp/song/x/1").ok).toBe(false);
    expect(parseMusicUrl("https://example.com/?u=https://music.apple.com/jp/song/x/1").ok).toBe(
      false,
    );
  });
});

describe("parseMusicUrl: Spotify", () => {
  it.each([
    "https://open.spotify.com/track/364JzOajs76bJymjHm3sVY",
    "https://open.spotify.com/intl-ja/track/364JzOajs76bJymjHm3sVY?si=68f9cd1fa7074d05",
    "共有テキスト https://open.spotify.com/intl-en/track/364JzOajs76bJymjHm3sVY/ です",
  ])("%s から曲IDを取り出し、si と intl-xx を落とす", (input) => {
    expect(parseMusicUrl(input)).toEqual({
      ok: true,
      service: "spotify",
      id: "364JzOajs76bJymjHm3sVY",
      canonicalUrl: "https://open.spotify.com/track/364JzOajs76bJymjHm3sVY",
    });
  });

  it("spotify.link の短縮URLは ID 未確定のまま受け付ける", () => {
    expect(parseMusicUrl("https://spotify.link/AbC123xyz?x=1")).toEqual({
      ok: true,
      service: "spotify",
      id: null,
      canonicalUrl: "https://spotify.link/AbC123xyz",
    });
  });

  it.each([
    ["https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", "album_only"],
    ["https://open.spotify.com/intl-ja/album/1DFixLWuPkv3KT3TnV35m3", "album_only"],
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "not_song"],
    ["https://open.spotify.com/artist/1snhtMLeb2DYoMOcVbb8iB", "not_song"],
    ["https://open.spotify.com/track/short", "not_song"],
    ["https://spotify.link/", "not_song"],
  ])("%s → %s", (input, reason) => {
    expect(parseMusicUrl(input)).toEqual({ ok: false, reason });
  });
});

describe("parseMusicUrl: YouTube Music", () => {
  it.each([
    "https://music.youtube.com/watch?v=S_XXx3yxx2U&si=tMa-189wNLpy3-r3",
    "https://www.youtube.com/watch?v=S_XXx3yxx2U",
    "https://m.youtube.com/watch?feature=share&v=S_XXx3yxx2U",
    "https://youtu.be/S_XXx3yxx2U?si=x",
  ])("%s から動画IDを取り出す", (input) => {
    expect(parseMusicUrl(input)).toEqual({
      ok: true,
      service: "youtube_music",
      id: "S_XXx3yxx2U",
      canonicalUrl: "https://music.youtube.com/watch?v=S_XXx3yxx2U",
    });
  });

  it.each([
    ["https://music.youtube.com/playlist?list=PLxxx", "not_song"],
    ["https://music.youtube.com/browse/MPREb_xxxxxxxx", "album_only"],
    ["https://music.youtube.com/channel/UCxxxx", "not_song"],
    ["https://music.youtube.com/watch?v=abc", "not_song"],
    ["https://youtu.be/", "not_song"],
  ])("%s → %s", (input, reason) => {
    expect(parseMusicUrl(input)).toEqual({ ok: false, reason });
  });
});
