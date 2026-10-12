import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongDraft } from "@/lib/songs/types";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/songs/itunes", () => ({ lookupTrack: vi.fn(), searchTracks: vi.fn() }));
vi.mock("@/lib/songs/resolve", () => ({ resolveExternal: vi.fn() }));

import { lookupTrack, searchTracks } from "@/lib/songs/itunes";
import type { ExternalMatch } from "@/lib/songs/resolve";
import { resolveExternal } from "@/lib/songs/resolve";
import { SourceError } from "@/lib/songs/source-fetch";
import { requireUser } from "@/lib/supabase/user";
import {
  lookupFromUrl,
  lookupManyAction,
  saveManyAction,
  saveSongAction,
  searchSongsAction,
} from "./actions";

const draft = (trackId: number, title = `曲${trackId}`): SongDraft => ({
  appleTrackId: trackId,
  title,
  artist: "YOASOBI",
  album: null,
  genre: "J-Pop",
  artworkUrl: null,
  durationMs: null,
  releaseDate: null,
  appleUrl: null,
  sourceService: "apple_music",
  sourceUrl: null,
});
const url = (id: number) => `https://music.apple.com/jp/song/x/${id}`;

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}

beforeEach(() => {
  vi.mocked(lookupTrack).mockReset();
  vi.mocked(searchTracks).mockReset();
  vi.mocked(resolveExternal).mockReset();
  setup();
});

describe("lookupFromUrl", () => {
  it("曲を取得し、登録済みならその曲を重複として返す", async () => {
    setup({ tables: { songs: { data: [{ id: "s1", title: "既存", apple_track_id: 5 }] } } });
    vi.mocked(lookupTrack).mockResolvedValue(draft(5));
    const r = await lookupFromUrl(`共有しました ${url(5)}`);
    expect(r).toEqual({ status: "ok", draft: draft(5), duplicate: { id: "s1", title: "既存" } });
    expect(lookupTrack).toHaveBeenCalledWith(5, "jp", expect.stringContaining("/5"));
  });

  it("未登録なら duplicate は null", async () => {
    vi.mocked(lookupTrack).mockResolvedValue(draft(5));
    expect(await lookupFromUrl(url(5))).toMatchObject({ status: "ok", duplicate: null });
  });

  it("URL の解析エラーはそのまま返す（API は呼ばない）", async () => {
    expect(await lookupFromUrl("")).toEqual({
      status: "error",
      reason: "empty",
      service: undefined,
    });
    expect(lookupTrack).not.toHaveBeenCalled();
  });

  it("未対応サービスはサービス名を添える", async () => {
    const r = await lookupFromUrl("https://music.amazon.co.jp/albums/B0?trackAsin=B1");
    expect(r).toEqual({ status: "error", reason: "unsupported_service", service: "amazon_music" });
  });

  it("通信エラーは network、見つからなければ not_found", async () => {
    vi.mocked(lookupTrack).mockRejectedValueOnce(new Error("timeout"));
    expect(await lookupFromUrl(url(5))).toEqual({ status: "error", reason: "network" });
    vi.mocked(lookupTrack).mockResolvedValueOnce(null);
    expect(await lookupFromUrl(url(5))).toEqual({ status: "error", reason: "not_found" });
  });
});

describe("lookupFromUrl: Spotify / YouTube Music", () => {
  const SPOTIFY = "https://open.spotify.com/track/364JzOajs76bJymjHm3sVY";
  const source = {
    service: "spotify" as const,
    method: "ogp" as const,
    id: "364JzOajs76bJymjHm3sVY",
    url: SPOTIFY,
    title: "夜に駆ける",
    artist: "YOASOBI",
    credits: [],
    album: null,
    releaseDate: null,
    durationSec: 258,
  };
  const fromSource: SongDraft = {
    ...draft(0, "夜に駆ける"),
    appleTrackId: null,
    genre: null,
    sourceService: "spotify",
    sourceUrl: SPOTIFY,
  };
  const match = (over: Partial<ExternalMatch>): ExternalMatch => ({
    confidence: "not_found",
    source,
    sourceDraft: fromSource,
    best: null,
    candidates: [],
    itunesFailed: false,
    ...over,
  });

  it("一致した曲を Apple Music の表記で返し、曲IDで重複を判定する", async () => {
    setup({ tables: { songs: { data: [{ id: "s1", title: "既存", apple_track_id: 7 }] } } });
    vi.mocked(resolveExternal).mockResolvedValue(
      match({ confidence: "confident", best: draft(7) }),
    );
    const r = await lookupFromUrl(`${SPOTIFY}?si=abc`);
    expect(resolveExternal).toHaveBeenCalledWith(
      expect.objectContaining({ service: "spotify", canonicalUrl: SPOTIFY }),
    );
    expect(lookupTrack).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      status: "ok",
      draft: draft(7),
      duplicate: { id: "s1", title: "既存" },
      external: { service: "spotify", confidence: "confident", itunesFailed: false },
    });
    expect(sb.argsOf("songs", "in")).toEqual([["apple_track_id", [7]]]);
  });

  it("要確認なら候補の先頭を下書きにし、候補ごとに重複を付ける", async () => {
    setup({
      tables: {
        songs: (ops) =>
          ops.some(([m]) => m === "in")
            ? { data: [{ id: "s2", title: "群青", apple_track_id: 2 }] }
            : { data: [] },
      },
    });
    vi.mocked(resolveExternal).mockResolvedValue(
      match({ confidence: "needs_confirmation", candidates: [draft(1), draft(2)] }),
    );
    const r = await lookupFromUrl(SPOTIFY);
    expect(r.status === "ok" && r.draft).toEqual(draft(1));
    expect(r.status === "ok" && r.external?.candidates).toEqual([
      { draft: draft(1), duplicate: null },
      { draft: draft(2), duplicate: { id: "s2", title: "群青" } },
    ]);
  });

  it("見つからなければ取得元の下書きにし、登録元URLで重複を判定する", async () => {
    setup({ tables: { songs: { data: [{ id: "s3", title: "夜に駆ける" }] } } });
    vi.mocked(resolveExternal).mockResolvedValue(match({ itunesFailed: true }));
    const r = await lookupFromUrl(SPOTIFY);
    expect(r).toMatchObject({
      status: "ok",
      draft: fromSource,
      duplicate: { id: "s3", title: "夜に駆ける" },
      external: { confidence: "not_found", itunesFailed: true, candidates: [] },
    });
    const bySource = sb.find("songs", "limit")[0].ops.filter(([m]) => m === "eq");
    expect(bySource).toEqual([
      ["eq", "source_service", "spotify"],
      ["eq", "source_url", SPOTIFY],
    ]);
    // 曲IDのない下書きしかないので、曲IDでの重複確認はしない
    expect(sb.find("songs", "in")).toEqual([]);
  });

  it.each([
    ["unsupported_url", "not_song"],
    ["fetch_failed", "source_failed"],
    ["meta_not_found", "source_meta_not_found"],
  ] as const)("取得元のエラー %s を %s にする", async (code, reason) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(resolveExternal).mockRejectedValue(new SourceError(code, "x"));
    expect(await lookupFromUrl(SPOTIFY)).toEqual({ status: "error", reason, service: "spotify" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(code));
    warn.mockRestore();
  });

  it("想定外の例外は握りつぶさない", async () => {
    vi.mocked(resolveExternal).mockRejectedValue(new TypeError("bug"));
    await expect(lookupFromUrl(SPOTIFY)).rejects.toThrow("bug");
  });

  it("まとめて登録でも、同じ曲の URL（追跡パラメータ違い）は2回目を取得しない", async () => {
    vi.mocked(resolveExternal).mockResolvedValue(
      match({ confidence: "confident", best: draft(7) }),
    );
    const r = await lookupManyAction([SPOTIFY, `${SPOTIFY}?si=zzz`]);
    expect(r.map((x) => x.repeated ?? false)).toEqual([false, true]);
    expect(resolveExternal).toHaveBeenCalledTimes(1);
  });
});

describe("searchSongsAction", () => {
  it("2文字未満は API を呼ばない", async () => {
    expect(await searchSongsAction(" 夜 ")).toEqual({ status: "error", reason: "too_short" });
    expect(searchTracks).not.toHaveBeenCalled();
  });

  it("結果に登録済みの印を付ける", async () => {
    setup({ tables: { songs: { data: [{ id: "s1", title: "x", apple_track_id: 1 }] } } });
    vi.mocked(searchTracks).mockResolvedValue([
      draft(1),
      draft(2),
      { ...draft(3), appleTrackId: null },
    ]);
    const r = await searchSongsAction("  夜に駆ける ");
    expect(searchTracks).toHaveBeenCalledWith("夜に駆ける");
    expect(r.status === "ok" && r.results.map((x) => x.duplicate)).toEqual([true, false, false]);
    expect(sb.argsOf("songs", "in")).toEqual([["apple_track_id", [1, 2]]]);
  });

  it("結果が空なら重複確認のクエリを投げない", async () => {
    vi.mocked(searchTracks).mockResolvedValue([]);
    expect(await searchSongsAction("存在しない曲")).toEqual({ status: "ok", results: [] });
    expect(sb.calls).toEqual([]);
  });

  it("通信エラーは network", async () => {
    vi.mocked(searchTracks).mockRejectedValue(new Error("503"));
    expect(await searchSongsAction("夜に駆ける")).toEqual({ status: "error", reason: "network" });
  });
});

describe("saveSongAction", () => {
  const input = { draft: draft(9), songKey: 1, memo: "", tagIds: [], newTags: [] };

  it("register_song を呼んで新しい曲IDを返す", async () => {
    setup({ rpc: { register_song: { data: "new-id" } } });
    expect(await saveSongAction(input)).toEqual({ status: "ok", id: "new-id" });
    expect(sb.rpcCalls[0]).toMatchObject({
      name: "register_song",
      args: { p_song: { apple_track_id: 9, song_key: 1 }, p_fields: {} },
    });
  });

  it("検証エラーは DB を呼ばない", async () => {
    expect(await saveSongAction({ draft: {} })).toEqual({
      status: "error",
      message: "曲名を入力してください",
    });
    expect(sb.rpcCalls).toEqual([]);
  });

  it.each([
    ["23505", { status: "duplicate" }],
    ["53400", { status: "limit" }],
    ["XX000", { status: "error", message: "保存できませんでした。もう一度お試しください。" }],
  ])("エラーコード %s を結果に変換する", async (code, expected) => {
    setup({ rpc: { register_song: { error: { code } } } });
    expect(await saveSongAction(input)).toEqual(expected);
  });
});

describe("lookupManyAction", () => {
  it("空行を捨て、同じ曲の2回目は API を呼ばずに repeated を付ける", async () => {
    vi.mocked(lookupTrack).mockImplementation(async (id) => draft(id));
    const r = await lookupManyAction([url(1), "  ", url(2), url(1), "not a url"]);
    expect(r.map((x) => [x.input, x.result.status, x.repeated ?? false])).toEqual([
      [url(1), "ok", false],
      [url(2), "ok", false],
      [url(1), "error", true],
      ["not a url", "error", false],
    ]);
    expect(lookupTrack).toHaveBeenCalledTimes(2);
  });

  it("配列以外は空、21件目以降は捨てる", async () => {
    expect(await lookupManyAction("x" as never)).toEqual([]);
    vi.mocked(lookupTrack).mockImplementation(async (id) => draft(id));
    const many = Array.from({ length: 25 }, (_, i) => url(i + 1));
    expect(await lookupManyAction(many)).toHaveLength(20);
  });
});

describe("saveManyAction", () => {
  it("全曲に同じタグを付けて登録し、結果を曲ごとに返す", async () => {
    setup({
      rpc: {
        register_song: [
          { data: "id-1" },
          { error: { code: "23505" } },
          { error: { code: "XX000" } },
        ],
      },
    });
    const tag = "44444444-4444-4444-8444-444444444444";
    const r = await saveManyAction(
      [draft(1, "A"), draft(2, "B"), draft(3, "C")],
      [tag],
      [{ name: "新規" }],
    );
    expect(r).toEqual([
      { title: "A", status: "ok", id: "id-1" },
      { title: "B", status: "duplicate" },
      { title: "C", status: "error" },
    ]);
    for (const c of sb.rpcCalls)
      expect(c.args).toMatchObject({ p_tag_ids: [tag], p_new_tags: [{ name: "新規" }] });
  });

  it("上限に達したら残りは試さない", async () => {
    setup({ rpc: { register_song: [{ data: "id-1" }, { error: { code: "53400" } }] } });
    const r = await saveManyAction([draft(1), draft(2), draft(3)]);
    expect(r.map((x) => x.status)).toEqual(["ok", "limit"]);
    expect(sb.rpcCalls).toHaveLength(2);
  });

  it("曲名が文字列でなければ空にし、配列以外は何もしない", async () => {
    expect(await saveManyAction([{ title: 1 }])).toEqual([{ title: "", status: "error" }]);
    expect(await saveManyAction(null as never)).toEqual([]);
  });
});
