import { describe, expect, it } from "vitest";
import { ITUNES_SEARCH, SPOTIFY_PAGES, watchHtml } from "./__fixtures__";
import { youtubeMusicUrl } from "./apple-url";
import { mapSearchResponse } from "./itunes";
import {
  coreTitle,
  judge,
  norm,
  rank,
  searchTerms,
  signals,
  score,
  type SourceSong,
} from "./match";
import { matchSource, sourceToDraft } from "./resolve";
import { parseSpotifyHtml } from "./spotify";
import type { SongDraft } from "./types";
import { parseWatchHtml } from "./youtube";

const src = (over: Partial<SourceSong> = {}): SourceSong => ({
  service: "spotify",
  method: "ogp",
  id: "x",
  url: "https://open.spotify.com/track/x",
  title: "1,000,000 TIMES feat. chelly (EGOIST)",
  artist: "MY FIRST STORY",
  credits: [],
  album: null,
  releaseDate: "2020-07-01",
  durationSec: 315,
  ...over,
});

const cand = (over: Partial<SongDraft> = {}): SongDraft => ({
  appleTrackId: 1,
  title: "1,000,000 TIMES (feat. chelly)",
  artist: "MY FIRST STORY",
  album: null,
  genre: null,
  artworkUrl: null,
  durationMs: 315000,
  releaseDate: "2020-07-01",
  appleUrl: null,
  sourceService: "search",
  sourceUrl: null,
  ...over,
});

describe("norm / coreTitle / searchTerms", () => {
  it("NFKC・小文字化・空白と記号の除去", () => {
    expect(norm("1,000,000 TIMES")).toBe("1000000times");
    expect(norm("1，000，000 Times")).toBe("1000000times");
    expect(norm("Mrs. GREEN APPLE")).toBe(norm("Mrs.GREEN APPLE"));
    expect(norm("ケセラセラ")).toBe("ケセラセラ");
    expect(norm(null)).toBe("");
  });

  it.each([
    ["1,000,000 TIMES feat. chelly (EGOIST)", "1,000,000 TIMES"],
    ["1,000,000 TIMES (feat. chelly)", "1,000,000 TIMES"],
    ["Song ft. Someone", "Song"],
    ["Song [Featuring X]", "Song"],
    ["ケセラセラ", "ケセラセラ"],
    ["Defeat. the end", "Defeat. the end"],
  ])("coreTitle(%j) → %j", (input, expected) => {
    expect(coreTitle(input)).toBe(expected);
  });

  it("検索語は「芯の曲名＋アーティスト」→「芯の曲名のみ」。アーティスト不明なら曲名だけ", () => {
    expect(searchTerms(src())).toEqual(["1,000,000 TIMES MY FIRST STORY", "1,000,000 TIMES"]);
    expect(searchTerms(src({ artist: null }))).toEqual(["1,000,000 TIMES"]);
  });
});

describe("signals / score / judge", () => {
  it("feat. 表記違い・長さ一致・リリース日一致", () => {
    const s = signals(cand(), src());
    expect(s).toEqual({
      title: "exact",
      artist: "exact",
      duration: "within1",
      release: true,
      fullTitle: false,
    });
    expect(score(s)).toBe(50 + 30 + 20 + 5);
    expect(judge(s)).toBe("confident");
  });

  it("アーティストが文字列で一致しなくても、長さ±1秒とリリース日の両方が合えば確信あり", () => {
    expect(judge(signals(cand({ artist: "米津玄師" }), src({ artist: "Kenshi Yonezu" })))).toBe(
      "confident",
    );
  });

  it("曲名だけの一致（カバー曲など）は採用しない", () => {
    const cover = cand({ artist: "Someone", durationMs: 200000, releaseDate: null });
    expect(judge(signals(cover, src()))).toBe("not_found");
  });

  it("曲名が一致しなくても、アーティストと長さが合えば要確認", () => {
    const s = signals(
      cand({ title: "ケセラセラ", artist: "Mrs. GREEN APPLE", durationMs: 273000 }),
      src({ title: "Que Sera Sera", artist: "Mrs. GREEN APPLE", durationSec: 273 }),
    );
    expect(judge(s)).toBe("needs_confirmation");
  });

  it("長さ3秒以内は別バージョン扱いで、長さの一致には数えない", () => {
    const s = signals(cand({ durationMs: 317500, artist: "X" }), src({ releaseDate: null }));
    expect(s.duration).toBe("within3");
    expect(score(s)).toBe(50 + 10);
    // 一致は曲名だけなので採用しない
    expect(judge(s)).toBe("not_found");
  });

  it("長さ・日付が無い候補でも落ちない", () => {
    const s = signals(cand({ durationMs: null, releaseDate: null }), src({ durationSec: null }));
    expect(s.duration).toBeNull();
    expect(s.release).toBe(false);
  });
});

describe("rank", () => {
  it("判定の良い順→点数順に並べ、同じ trackId は1件にまとめる", () => {
    const a = cand({ appleTrackId: 1, artist: "Other", durationMs: 1000, releaseDate: null });
    const b = cand({ appleTrackId: 2 });
    const r = rank([a, b, b], src());
    expect(r.map((x) => [x.draft.appleTrackId, x.confidence])).toEqual([
      [2, "confident"],
      [1, "not_found"],
    ]);
  });
});

// ───────── Issue #4 のテストケース（実データの回帰確認） ─────────

const fixtureSearch = async (term: string) => {
  const body = ITUNES_SEARCH[term];
  if (!body) throw new Error(`no iTunes fixture for ${JSON.stringify(term)}`);
  return mapSearchResponse(body);
};

const spotify = (id: string) => parseSpotifyHtml(SPOTIFY_PAGES[id])!;
const ytmusic = (id: string): SourceSong => ({
  service: "youtube_music",
  method: "watch_html",
  id,
  url: youtubeMusicUrl(id),
  ...parseWatchHtml(watchHtml(id))!,
});

describe("matchSource: 両サービスから同じ iTunes の曲に寄る", () => {
  it.each([
    ["ケセラセラ / Spotify", () => spotify("406ZlqOP9nLQxJFBY7d9S4"), "confident", 1681600508],
    ["ケセラセラ / YT", () => ytmusic("s4ZThuWQdhA"), "needs_confirmation", 1681600508],
    ["1,000,000 TIMES / Spotify", () => spotify("3dVMeI08Of33bjSELmtSqq"), "confident", 1516799649],
    ["1,000,000 TIMES / YT", () => ytmusic("OMrkUUNvM48"), "confident", 1516799649],
    ["IRIS OUT / Spotify", () => spotify("59hVbgr8rfYkDbHfr8RcGI"), "confident", 1837658529],
    ["IRIS OUT / YT", () => ytmusic("wggigwtz4dQ"), "confident", 1837658529],
  ] as const)("%s", async (_, source, confidence, trackId) => {
    const s = source();
    const m = await matchSource(s, fixtureSearch);
    expect(m.confidence).toBe(confidence);
    const top = m.best ?? m.candidates[0];
    expect(top.appleTrackId).toBe(trackId);
    // 登録元は Spotify / YouTube Music のURLのまま
    expect(top).toMatchObject({ sourceService: s.service, sourceUrl: s.url });
  });

  it("1,000,000 TIMES はアルバム「Ⅴ」版ではなくシングル版を選ぶ", async () => {
    const m = await matchSource(spotify("3dVMeI08Of33bjSELmtSqq"), fixtureSearch);
    expect(m.best?.appleTrackId).not.toBe(1525687670);
  });

  it("要確認の候補は最大3件", async () => {
    const m = await matchSource(ytmusic("s4ZThuWQdhA"), fixtureSearch);
    expect(m.candidates.length).toBeGreaterThan(0);
    expect(m.candidates.length).toBeLessThanOrEqual(3);
    expect(m.best).toBeNull();
  });

  it("①で見つかれば②（曲名のみ）は検索しない", async () => {
    const terms: string[] = [];
    await matchSource(spotify("406ZlqOP9nLQxJFBY7d9S4"), (t) => {
      terms.push(t);
      return fixtureSearch(t);
    });
    expect(terms).toEqual(["ケセラセラ Mrs. GREEN APPLE"]);
  });
});

describe("matchSource: 見つからない・失敗", () => {
  it("候補が無ければ not_found で、取得元の値の下書きを返す", async () => {
    const s = src();
    const m = await matchSource(s, async () => []);
    expect(m).toMatchObject({
      confidence: "not_found",
      best: null,
      candidates: [],
      itunesFailed: false,
    });
    expect(m.sourceDraft).toEqual(sourceToDraft(s));
  });

  it("iTunes Search の失敗は not_found（itunesFailed）として返す", async () => {
    const m = await matchSource(src(), async () => {
      throw new Error("503");
    });
    expect(m).toMatchObject({ confidence: "not_found", itunesFailed: true });
  });

  it("取得元の下書き：アーティスト不明は空文字、長さはミリ秒", () => {
    expect(sourceToDraft(src({ artist: null, durationSec: 273 }))).toMatchObject({
      appleTrackId: null,
      artist: "",
      durationMs: 273000,
      sourceService: "spotify",
      sourceUrl: "https://open.spotify.com/track/x",
    });
  });
});
