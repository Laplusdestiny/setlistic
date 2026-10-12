import { describe, expect, it } from "vitest";
import { mapLookupResponse, mapSearchResponse } from "./itunes";

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
