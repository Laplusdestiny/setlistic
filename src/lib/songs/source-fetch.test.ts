import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ITUNES_SEARCH, SPOTIFY_PAGES, YOUTUBE_MUSIC_NEXT, watchHtml } from "./__fixtures__";
import { resolveExternal } from "./resolve";
import { SourceError, USER_AGENT, fetchJson, fetchText } from "./source-fetch";
import { fetchSpotify } from "./spotify";
import { fetchYoutube } from "./youtube";

// Spotify / YouTube / iTunes への通信は fetch をスタブし、実際に取得した応答（__fixtures__）を返す

const PEACE_SIGN = "364JzOajs76bJymjHm3sVY";
const SPACE_SONIC = "Pmgc40BUVaI";
const M87 = "7QDosulSmBw";
// YouTube Music の内部 API で曲が分からなかったとき（一般の動画など）の応答
const NO_MUSIC = JSON.stringify({ contents: {} });

function response(body: string, init: { status?: number; url?: string } = {}) {
  const res = new Response(body, { status: init.status ?? 200 });
  if (init.url) Object.defineProperty(res, "url", { value: init.url });
  return res;
}

let fetchMock: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  warn.mockRestore();
});

const calledUrls = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe("fetchText / fetchJson", () => {
  it("自前の UA と日本語で取得し、リダイレクト後の URL を返す", async () => {
    fetchMock.mockResolvedValue(response("<html>", { url: "https://open.spotify.com/track/x" }));
    expect(await fetchText("https://spotify.link/abc")).toEqual({
      finalUrl: "https://open.spotify.com/track/x",
      body: "<html>",
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja" },
      cache: "no-store",
    });
  });

  it("json を渡すと、それを本文にして POST する", async () => {
    fetchMock.mockResolvedValue(response('{"ok":true}'));
    expect(await fetchJson("https://example.com/api", { a: 1 })).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: '{"a":1}',
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
    });
  });

  it("リダイレクトがなければ取得した URL のまま", async () => {
    fetchMock.mockResolvedValue(response("ok"));
    expect((await fetchText("https://example.com/a")).finalUrl).toBe("https://example.com/a");
  });

  it("通信エラー・HTTP エラーは fetch_failed（ホスト名付き）", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(fetchText("https://www.youtube.com/watch?v=x")).rejects.toMatchObject({
      code: "fetch_failed",
      message: "www.youtube.com: timeout",
    });
    fetchMock.mockResolvedValueOnce(response("busy", { status: 429 }));
    await expect(fetchText("https://www.youtube.com/watch?v=x")).rejects.toMatchObject({
      code: "fetch_failed",
      message: "www.youtube.com: HTTP 429",
    });
  });

  it("JSON を読む。壊れていれば meta_not_found", async () => {
    fetchMock.mockResolvedValueOnce(response('{"a":1}'));
    expect(await fetchJson("https://example.com/j")).toEqual({ a: 1 });
    fetchMock.mockResolvedValueOnce(response("<html>"));
    const e = await fetchJson("https://example.com/j").catch((x) => x);
    expect(e).toBeInstanceOf(SourceError);
    expect(e).toMatchObject({ name: "SourceError", code: "meta_not_found" });
  });
});

describe("fetchSpotify", () => {
  it("曲IDから曲ページを取得して読む", async () => {
    fetchMock.mockResolvedValue(response(SPOTIFY_PAGES[PEACE_SIGN]));
    const song = await fetchSpotify(PEACE_SIGN, `https://open.spotify.com/track/${PEACE_SIGN}`);
    expect(calledUrls()).toEqual([`https://open.spotify.com/track/${PEACE_SIGN}`]);
    expect(song).toMatchObject({
      id: PEACE_SIGN,
      title: "ピースサイン - Peace Sign",
      artist: "米津玄師",
    });
  });

  it("短縮URL（spotify.link）はリダイレクト先から曲IDを決める", async () => {
    fetchMock.mockResolvedValue(
      response(SPOTIFY_PAGES[PEACE_SIGN], {
        url: `https://open.spotify.com/intl-ja/track/${PEACE_SIGN}?si=1`,
      }),
    );
    const song = await fetchSpotify(null, "https://spotify.link/AbCdEf");
    expect(calledUrls()).toEqual(["https://spotify.link/AbCdEf"]);
    expect(song.id).toBe(PEACE_SIGN);
  });

  it("短縮URLの展開先が曲でなければ unsupported_url", async () => {
    fetchMock.mockResolvedValue(
      response("<html>", { url: "https://open.spotify.com/album/1A2B3C4D5E6F7G8H9I0J1K" }),
    );
    await expect(fetchSpotify(null, "https://spotify.link/x")).rejects.toMatchObject({
      code: "unsupported_url",
    });
  });

  it("曲情報の meta がないページは meta_not_found", async () => {
    fetchMock.mockResolvedValue(response("<html><head></head></html>"));
    await expect(fetchSpotify(PEACE_SIGN, "u")).rejects.toMatchObject({
      code: "meta_not_found",
      message: expect.stringContaining("bytes"),
    });
  });
});

describe("fetchYoutube", () => {
  const dataApi = {
    items: [
      {
        snippet: {
          title: "Space Sonic",
          channelTitle: "ELLEGARDEN - Topic",
          description:
            "Provided to YouTube by X\n\nSpace Sonic · ELLEGARDEN\n\nSpace Sonic\n\n℗ 2005\n\nReleased on: 2005-12-07",
        },
        contentDetails: { duration: "PT3M29S" },
      },
    ],
  };

  it("まず YouTube Music の内部 API を日本語で呼び、日本語の表記で取得する", async () => {
    fetchMock.mockResolvedValue(response(JSON.stringify(YOUTUBE_MUSIC_NEXT[M87])));
    const song = await fetchYoutube(M87, "key-1");
    expect(calledUrls()).toEqual(["https://music.youtube.com/youtubei/v1/next?prettyPrint=false"]);
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      videoId: M87,
      context: { client: { clientName: "WEB_REMIX", hl: "ja", gl: "JP" } },
    });
    expect(song).toMatchObject({
      service: "youtube_music",
      method: "music_next",
      id: M87,
      url: `https://music.youtube.com/watch?v=${M87}`,
      title: "M八七",
      artist: "米津玄師",
      durationSec: 264,
    });
  });

  it("内部 API で分からず、API キーがあれば Data API で取得する", async () => {
    fetchMock
      .mockResolvedValueOnce(response(NO_MUSIC))
      .mockResolvedValueOnce(response(JSON.stringify(dataApi)));
    const song = await fetchYoutube(SPACE_SONIC, "key-1");
    const u = new URL(calledUrls()[1]);
    expect(u.host).toBe("www.googleapis.com");
    expect(u.searchParams.get("key")).toBe("key-1");
    expect(song).toMatchObject({
      method: "data_api",
      title: "Space Sonic",
      artist: "ELLEGARDEN",
      durationSec: 209,
    });
    expect(warn.mock.calls[0][0]).toContain("music_next failed");
  });

  it("API キーがなければ watch ページから読む", async () => {
    fetchMock
      .mockResolvedValueOnce(response("busy", { status: 429 }))
      .mockResolvedValueOnce(response(watchHtml(SPACE_SONIC)));
    const song = await fetchYoutube(SPACE_SONIC, undefined);
    expect(calledUrls()[1]).toBe(`https://www.youtube.com/watch?v=${SPACE_SONIC}&hl=ja`);
    expect(song).toMatchObject({
      method: "watch_html",
      title: "Space Sonic",
      artist: "ELLEGARDEN",
    });
  });

  it("Data API で見つからず、watch ページが 429 なら oEmbed まで進む", async () => {
    fetchMock
      .mockResolvedValueOnce(response(NO_MUSIC))
      .mockResolvedValueOnce(response(JSON.stringify({ items: [] })))
      .mockResolvedValueOnce(response("too many", { status: 429 }))
      .mockResolvedValueOnce(
        response(JSON.stringify({ title: "ELLEGARDEN「Space Sonic」", author_name: "ELLEGARDEN" })),
      );
    const song = await fetchYoutube(SPACE_SONIC, "key-1");
    expect(song).toMatchObject({ method: "oembed", title: "Space Sonic" });
    expect(new URL(calledUrls()[3]).pathname).toBe("/oembed");
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[1][0]).toContain("data_api failed");
  });

  it("すべて失敗したら最後のエラーを投げる（SourceError 以外は fetch_failed にする）", async () => {
    fetchMock
      .mockResolvedValueOnce(response(NO_MUSIC))
      .mockResolvedValueOnce(response("<html>no player</html>"))
      .mockImplementationOnce(() => {
        throw new TypeError("boom");
      });
    // fetchText の外で起きた想定外の例外も fetch_failed として扱う
    const e = await fetchYoutube(SPACE_SONIC, undefined).catch((x) => x);
    expect(e).toBeInstanceOf(SourceError);
    expect(e.code).toBe("fetch_failed");
  });

  it("どの方法でも曲情報がなければ meta_not_found", async () => {
    fetchMock
      .mockResolvedValueOnce(response(NO_MUSIC))
      .mockResolvedValueOnce(response("<html></html>"))
      .mockResolvedValueOnce(response(JSON.stringify({})));
    await expect(fetchYoutube(SPACE_SONIC, undefined)).rejects.toMatchObject({
      code: "meta_not_found",
      message: "YouTube oembed: no video details",
    });
  });
});

describe("resolveExternal", () => {
  it("Spotify の曲を取得し、iTunes Search で Apple Music の曲にそろえる", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("https://open.spotify.com/")) return response(SPOTIFY_PAGES[PEACE_SIGN]);
      const term = new URL(url).searchParams.get("term")!;
      return response(JSON.stringify(ITUNES_SEARCH[term] ?? { results: [] }));
    });
    const m = await resolveExternal({
      ok: true,
      service: "spotify",
      id: PEACE_SIGN,
      canonicalUrl: `https://open.spotify.com/track/${PEACE_SIGN}`,
    });
    expect(m.source).toMatchObject({ service: "spotify", title: "ピースサイン - Peace Sign" });
    expect(calledUrls().some((u) => u.startsWith("https://itunes.apple.com/search"))).toBe(true);
    expect(m.itunesFailed).toBe(false);
    // 一致した Apple Music の曲を、登録元が Spotify の下書きとして返す
    expect(m.confidence).toBe("confident");
    expect(m.best).toMatchObject({
      title: "ピースサイン - Peace Sign",
      artist: "米津玄師",
      sourceService: "spotify",
      sourceUrl: `https://open.spotify.com/track/${PEACE_SIGN}`,
    });
    expect(m.best?.appleTrackId).toBe(1538275660);
  });

  it("YouTube Music の曲は動画IDで取得する", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("https://www.youtube.com/")
        ? response(watchHtml(SPACE_SONIC))
        : url.startsWith("https://music.youtube.com/")
          ? response(NO_MUSIC)
          : response(JSON.stringify({ results: [] })),
    );
    const m = await resolveExternal({
      ok: true,
      service: "youtube_music",
      id: SPACE_SONIC,
      canonicalUrl: `https://music.youtube.com/watch?v=${SPACE_SONIC}`,
    });
    expect(m).toMatchObject({ confidence: "not_found", best: null, candidates: [] });
    expect(m.sourceDraft).toMatchObject({ title: "Space Sonic", sourceService: "youtube_music" });
  });

  it("取得元の失敗は SourceError のまま投げる", async () => {
    fetchMock.mockResolvedValue(response("x", { status: 500 }));
    await expect(
      resolveExternal({ ok: true, service: "spotify", id: PEACE_SIGN, canonicalUrl: "u" }),
    ).rejects.toBeInstanceOf(SourceError);
  });
});
