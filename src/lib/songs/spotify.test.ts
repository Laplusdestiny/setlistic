import { describe, expect, it } from "vitest";
import { SPOTIFY_PAGES } from "./__fixtures__";
import { parseSpotifyHtml } from "./spotify";

describe("parseSpotifyHtml（実物のページ）", () => {
  it.each([
    [
      "364JzOajs76bJymjHm3sVY",
      "ピースサイン - Peace Sign",
      "米津玄師",
      "BOOTLEG",
      "2017-11-01",
      239,
    ],
    ["55n4sFy8tjysBcCjQFwX3A", "CORE PRIDE", "UVERworld", "LIFE 6 SENSE", "2011-06-01", 259],
    ["34DHNZGOXmfxJM68wMWa8V", "Last 7 Letters", "oneohkay", "Last 7 Letters", "2018-12-03", 205],
  ])("%s", (id, title, artist, album, releaseDate, durationSec) => {
    expect(parseSpotifyHtml(SPOTIFY_PAGES[id])).toEqual({
      service: "spotify",
      method: "ogp",
      id,
      url: `https://open.spotify.com/track/${id}`,
      title,
      artist,
      credits: [],
      album,
      releaseDate,
      durationSec,
    });
  });

  it("曲名を「 - 」で分割しない", () => {
    expect(parseSpotifyHtml(SPOTIFY_PAGES["364JzOajs76bJymjHm3sVY"])?.title).toBe(
      "ピースサイン - Peace Sign",
    );
  });

  it("feat. のアーティストはメインと credits に分ける", () => {
    expect(parseSpotifyHtml(SPOTIFY_PAGES["3dVMeI08Of33bjSELmtSqq"])).toMatchObject({
      title: "1,000,000 TIMES feat. chelly (EGOIST)",
      artist: "MY FIRST STORY",
      credits: ["chelly (EGOIST)"],
      album: "1,000,000 TIMES",
    });
  });
});

describe("parseSpotifyHtml（境界）", () => {
  const page = (tags: string) => `<html><head>${tags}</head></html>`;
  const base =
    '<link rel="canonical" href="https://open.spotify.com/intl-ja/track/364JzOajs76bJymjHm3sVY">' +
    '<meta property="og:title" content="Tom &amp; Jerry">';

  it("アーティストページが1つなら、カンマを含む名前を分けない", () => {
    const r = parseSpotifyHtml(
      page(
        base +
          '<meta name="music:musician" content="https://open.spotify.com/artist/x">' +
          '<meta name="music:musician_description" content="Earth, Wind &amp; Fire">',
      ),
    );
    expect(r).toMatchObject({ title: "Tom & Jerry", artist: "Earth, Wind & Fire", credits: [] });
  });

  it("アルバム名に「 · 」が入っても崩れない／日付・長さが不正なら null", () => {
    const r = parseSpotifyHtml(
      page(
        base +
          '<meta name="music:musician_description" content="A">' +
          '<meta property="og:description" content="A · X · Y · 曲 · 2020">' +
          '<meta name="music:release_date" content="2020">' +
          '<meta name="music:duration" content="abc">',
      ),
    );
    expect(r).toMatchObject({ album: "X · Y", releaseDate: null, durationSec: null });
  });

  it("canonical が無ければ og:url、それも無ければ呼び出し元のIDを使う", () => {
    const tags =
      '<meta property="og:title" content="T"><meta name="music:musician_description" content="A">';
    expect(
      parseSpotifyHtml(
        page(
          tags +
            '<meta property="og:url" content="https://open.spotify.com/track/55n4sFy8tjysBcCjQFwX3A">',
        ),
      )?.id,
    ).toBe("55n4sFy8tjysBcCjQFwX3A");
    expect(parseSpotifyHtml(page(tags), "34DHNZGOXmfxJM68wMWa8V")?.id).toBe(
      "34DHNZGOXmfxJM68wMWa8V",
    );
    expect(parseSpotifyHtml(page(tags))).toBeNull();
  });

  it("曲名かアーティストが無ければ null（ブラウザUAで返る中身のないページ）", () => {
    expect(parseSpotifyHtml(page(base))).toBeNull();
    expect(parseSpotifyHtml("<html><head><title>Spotify</title></head></html>")).toBeNull();
  });
});
