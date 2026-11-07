import { describe, expect, it } from "vitest";
import { YOUTUBE_MUSIC_NEXT, watchHtml } from "./__fixtures__";
import {
  extractPlayerResponse,
  fromTitleAndChannel,
  parseClock,
  parseDataApi,
  parseIsoDuration,
  parseMusicNext,
  parseOembed,
  parseProvidedDescription,
  parseWatchHtml,
} from "./youtube";

describe("parseWatchHtml（実物の playerResponse）", () => {
  it.each([
    ["S_XXx3yxx2U", "Paper Chasing", "Lvly", ["G Curtis"], "Way Way Back", "2018-05-25", 176],
    ["Pmgc40BUVaI", "Space Sonic", "ELLEGARDEN", ["細美武士"], "Space Sonic", "2005-12-07", 209],
    ["wggigwtz4dQ", "IRIS OUT", "Kenshi Yonezu", [], "IRIS OUT", "2025-09-15", 152],
  ])("%s", (id, title, artist, credits, album, releaseDate, durationSec) => {
    expect(parseWatchHtml(watchHtml(id))).toEqual({
      title,
      artist,
      credits,
      album,
      releaseDate,
      durationSec,
    });
  });
});

describe("parseMusicNext（実物の応答）", () => {
  // watch ページ・oEmbed では Asuca Hayashi / Kenshi Yonezu / Ryoichi Higuchi になる曲（Issue #47）
  it.each([
    ["I2lwBfsfV5k", "小さきもの", "林明日香", "咲", 334],
    ["7QDosulSmBw", "M八七", "米津玄師", "M八七", 264],
    ["Fr4tGn29hD8", "1/6の夢旅人2002（オリジナル）", "樋口 了一", "1/6の夢旅人2002", 237],
    // MV はアルバムが無く、曲名に「(Official Music Video)」などの飾りも付かない
    ["x8VYWazR5mE", "夜に駆ける", "YOASOBI", null, 276],
  ])("%s", (id, title, artist, album, durationSec) => {
    expect(parseMusicNext(YOUTUBE_MUSIC_NEXT[id], id)).toEqual({
      title,
      artist,
      credits: [],
      album,
      releaseDate: null,
      durationSec,
    });
  });

  const panel = (renderer: unknown) => ({
    contents: [
      {
        playlistPanelVideoWrapperRenderer: {
          primaryRenderer: { playlistPanelVideoRenderer: renderer },
        },
      },
    ],
  });
  const link = (text: string, pageType: string) => ({
    text,
    navigationEndpoint: {
      browseEndpoint: {
        browseEndpointContextSupportedConfigs: {
          browseEndpointContextMusicConfig: { pageType },
        },
      },
    },
  });

  it("2人目以降のアーティストは credits に入れる", () => {
    const body = panel({
      videoId: "v1",
      title: { runs: [{ text: "曲" }] },
      longBylineText: {
        runs: [
          link("A", "MUSIC_PAGE_TYPE_ARTIST"),
          { text: "" },
          { text: " & " },
          link("B", "MUSIC_PAGE_TYPE_ARTIST"),
          { text: " • " },
          link("A", "MUSIC_PAGE_TYPE_ARTIST"),
        ],
      },
    });
    expect(parseMusicNext(body, "v1")).toMatchObject({
      artist: "A",
      credits: ["B"],
      album: null,
      durationSec: null,
    });
  });

  it("アーティストのリンクが無い（一般の動画）・別の動画しか無い・壊れているときは null", () => {
    const ugc = {
      videoId: "v1",
      title: { runs: [{ text: "歌ってみた" }] },
      longBylineText: { runs: [link("チャンネル", "MUSIC_PAGE_TYPE_USER_CHANNEL")] },
    };
    expect(parseMusicNext(panel(ugc), "v1")).toBeNull();
    expect(parseMusicNext(YOUTUBE_MUSIC_NEXT["7QDosulSmBw"], "v1")).toBeNull();
    expect(parseMusicNext(panel({ videoId: "v1", title: {} }), "v1")).toBeNull();
    expect(parseMusicNext(null, "v1")).toBeNull();
  });
});

describe("parseClock", () => {
  it.each([
    ["5:34", 334],
    ["1:02:03", 3723],
    [" 0:59 ", 59],
    ["", null],
    [null, null],
    ["5分34秒", null],
    ["534", null],
  ])("%j → %j", (s, sec) => {
    expect(parseClock(s)).toBe(sec);
  });
});

describe("extractPlayerResponse", () => {
  it("文字列中の括弧・エスケープに惑わされず、代入された JSON だけを取り出す", () => {
    const html = 'x ytInitialPlayerResponse = {"a":"}{\\"","b":{"c":1}}; var y = {"d":2};';
    expect(extractPlayerResponse(html)).toEqual({ a: '}{"', b: { c: 1 } });
  });

  it("見つからない・閉じていない・壊れているときは null", () => {
    expect(extractPlayerResponse("<html></html>")).toBeNull();
    expect(extractPlayerResponse('ytInitialPlayerResponse = {"a":1')).toBeNull();
    expect(extractPlayerResponse("ytInitialPlayerResponse = {a:1}")).toBeNull();
  });
});

describe("parseProvidedDescription", () => {
  it("作詞・作曲のクレジットは重複を除いて credits に入れる", () => {
    const d =
      "Provided to YouTube by X\n\nSpace Sonic · ELLEGARDEN · 細美武士 · 細美武士\n\nSpace Sonic\n\n℗ GROWING UP\n\nReleased on: 2005-12-07";
    expect(parseProvidedDescription(d)).toMatchObject({
      artist: "ELLEGARDEN",
      credits: ["細美武士"],
    });
  });

  it("アルバムの段が無ければ album は null", () => {
    expect(
      parseProvidedDescription("Provided to YouTube by X\n\nT · A\n\n℗ 2020 X")?.album,
    ).toBeNull();
  });

  it("自動生成の形式でなければ null", () => {
    expect(parseProvidedDescription("公式MVです")).toBeNull();
    expect(parseProvidedDescription("Provided to YouTube by X")).toBeNull();
    expect(parseProvidedDescription(null)).toBeNull();
  });
});

describe("fromTitleAndChannel", () => {
  it("「〜 - Topic」チャンネルは末尾を除いた名前をアーティストにする", () => {
    expect(fromTitleAndChannel("ピースサイン - Peace Sign", "米津玄師 - Topic")).toMatchObject({
      title: "ピースサイン - Peace Sign",
      artist: "米津玄師",
    });
  });

  it("Various Artists - Topic はアーティスト不明", () => {
    expect(fromTitleAndChannel("Song", "Various Artists - Topic").artist).toBeNull();
  });

  it.each([
    ["YOASOBI「夜に駆ける」 Official Music Video", "YOASOBI", "YOASOBI", "夜に駆ける"],
    ["米津玄師 MV「ピースサイン」", "米津玄師", "米津玄師", "ピースサイン"],
    [
      "Official髭男dism - Pretender［Official Video］",
      "Official髭男dism",
      "Official髭男dism",
      "Pretender",
    ],
    ["Ado - 唱 (Official Music Video)", "Ado", "Ado", "唱"],
    ["夜に駆ける", "Some Channel", "Some Channel", "夜に駆ける"],
  ])("MV: %s", (title, channel, artist, song) => {
    expect(fromTitleAndChannel(title, channel)).toMatchObject({ title: song, artist });
  });
});

describe("parseIsoDuration", () => {
  it.each([
    ["PT4M33S", 273],
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["P1DT1S", 86401],
  ])("%s → %d", (iso, sec) => {
    expect(parseIsoDuration(iso)).toBe(sec);
  });

  it.each(["", "PT", "P", "4:33", null])("%j → null", (iso) => {
    expect(parseIsoDuration(iso)).toBeNull();
  });
});

describe("parseDataApi / parseOembed", () => {
  it("Data API の説明文と長さを読む", () => {
    expect(
      parseDataApi({
        items: [
          {
            snippet: {
              title: "Que Sera Sera",
              channelTitle: "Mrs. GREEN APPLE - Topic",
              description:
                "Provided to YouTube by Universal Music Group\n\nQue Sera Sera · Mrs. GREEN APPLE\n\nQue Sera Sera\n\n℗ 2023\n\nReleased on: 2023-04-25",
            },
            contentDetails: { duration: "PT4M33S" },
          },
        ],
      }),
    ).toEqual({
      title: "Que Sera Sera",
      artist: "Mrs. GREEN APPLE",
      credits: [],
      album: "Que Sera Sera",
      releaseDate: "2023-04-25",
      durationSec: 273,
    });
  });

  it("Data API で動画が無い（非公開・削除）ときは null", () => {
    expect(parseDataApi({ items: [] })).toBeNull();
    expect(parseDataApi(null)).toBeNull();
  });

  it("oEmbed は曲名とチャンネル名だけ", () => {
    expect(parseOembed({ title: "IRIS OUT", author_name: "Kenshi Yonezu - Topic" })).toEqual({
      title: "IRIS OUT",
      artist: "Kenshi Yonezu",
      credits: [],
      album: null,
      releaseDate: null,
      durationSec: null,
    });
    expect(parseOembed({})).toBeNull();
  });
});
