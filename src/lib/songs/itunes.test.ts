import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupTrack, mapLookupResponse, mapSearchResponse, searchTracks } from "./itunes";

const track = {
  wrapperType: "track",
  kind: "song",
  trackId: 1542182776,
  artistName: "YOASOBI",
  collectionName: "THE BOOK",
  trackName: "夜に駆ける",
  trackViewUrl:
    "https://music.apple.com/jp/album/%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B/1542182291?i=1542182776&uo=4",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
  releaseDate: "2019-12-15T08:00:00Z",
  trackTimeMillis: 258840,
  primaryGenreName: "J-Pop",
};

describe("mapLookupResponse", () => {
  it("曲情報を SongDraft に変換する", () => {
    const d = mapLookupResponse(
      { resultCount: 1, results: [track] },
      "https://music.apple.com/jp/song/1542182776",
    );
    expect(d).toEqual({
      appleTrackId: 1542182776,
      title: "夜に駆ける",
      artist: "YOASOBI",
      album: "THE BOOK",
      genre: "J-Pop",
      artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
      durationMs: 258840,
      releaseDate: "2019-12-15",
      appleUrl:
        "https://music.apple.com/jp/album/%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B/1542182291?i=1542182776",
      sourceService: "apple_music",
      sourceUrl: "https://music.apple.com/jp/song/1542182776",
    });
  });

  it("試聴URL（previewUrl）は結果に含めない", () => {
    const d = mapLookupResponse({ results: [track] }, null);
    expect(JSON.stringify(d)).not.toContain("preview");
    expect(JSON.stringify(d)).not.toContain("audio-ssl");
  });

  it("アルバム行（collection）が先頭に来ても曲を拾う", () => {
    const d = mapLookupResponse(
      { results: [{ wrapperType: "collection", collectionName: "x" }, track] },
      null,
    );
    expect(d?.appleTrackId).toBe(1542182776);
  });

  it("見つからない・壊れた応答は null", () => {
    expect(mapLookupResponse({ resultCount: 0, results: [] }, null)).toBeNull();
    expect(mapLookupResponse({}, null)).toBeNull();
    expect(mapLookupResponse(null, null)).toBeNull();
    expect(mapLookupResponse({ results: "x" }, null)).toBeNull();
  });

  it("任意項目が欠けていても変換できる", () => {
    const d = mapLookupResponse(
      { results: [{ kind: "song", trackId: 1, trackName: "t", artistName: "a" }] },
      null,
    );
    expect(d).toMatchObject({
      album: null,
      genre: null,
      artworkUrl: null,
      durationMs: null,
      releaseDate: null,
      appleUrl: null,
    });
  });
});

describe("mapSearchResponse", () => {
  it("曲だけを source_service=search で返す", () => {
    const list = mapSearchResponse({
      results: [
        track,
        { kind: "music-video", trackId: 2, trackName: "mv", artistName: "a" },
        { kind: "song" },
      ],
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      sourceService: "search",
      sourceUrl: null,
      title: "夜に駆ける",
    });
  });

  it("結果が無ければ空配列", () => {
    expect(mapSearchResponse({ results: [] })).toEqual([]);
    expect(mapSearchResponse(undefined)).toEqual([]);
  });
});

describe("通信（fetch をスタブ）", () => {
  const respond = (body: unknown, status = 200) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "text/javascript; charset=utf-8" },
    });
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lookupTrack: 指定の国で見つかればそれを返す", async () => {
    fetchMock.mockResolvedValue(respond({ results: [track] }));
    const d = await lookupTrack(1542182776, "us", "https://music.apple.com/us/song/1");
    expect(d?.title).toBe("夜に駆ける");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://itunes.apple.com/lookup?id=1542182776&country=us&entity=song",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("lookupTrack: 見つからなければ jp で取り直す", async () => {
    fetchMock
      .mockResolvedValueOnce(respond({ results: [] }))
      .mockResolvedValueOnce(respond({ results: [track] }));
    const d = await lookupTrack(1, "gb", "u");
    expect(d?.sourceUrl).toBe("u");
    expect(fetchMock.mock.calls.map((c) => new URL(c[0]).searchParams.get("country"))).toEqual([
      "gb",
      "jp",
    ]);
  });

  it("lookupTrack: 国の指定がなければ jp だけ。どこにもなければ null", async () => {
    fetchMock.mockResolvedValue(respond({ results: [] }));
    expect(await lookupTrack(1, null, "u")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("HTTP エラーは例外にする", async () => {
    fetchMock.mockResolvedValue(respond("busy", 503));
    await expect(lookupTrack(1, "jp", "u")).rejects.toThrow("iTunes API 503");
  });

  it("searchTracks: 日本のストアを日本語で検索する", async () => {
    fetchMock.mockResolvedValue(respond({ results: [track] }));
    const list = await searchTracks("夜に駆ける", 5);
    expect(list).toHaveLength(1);
    const u = new URL(fetchMock.mock.calls[0][0]);
    expect(u.pathname).toBe("/search");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      term: "夜に駆ける",
      country: "jp",
      media: "music",
      entity: "song",
      limit: "5",
      lang: "ja_jp",
    });
  });
});

describe("toSongDraft の細部", () => {
  it("壊れた trackViewUrl と日付形式でない releaseDate は null", () => {
    const d = mapLookupResponse(
      { results: [{ ...track, trackViewUrl: "not a url", releaseDate: "December 2019" }] },
      null,
    );
    expect(d).toMatchObject({ appleUrl: null, releaseDate: null });
  });
});
