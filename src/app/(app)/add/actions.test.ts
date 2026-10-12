import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongDraft } from "@/lib/songs/types";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/songs/itunes", () => ({ lookupTrack: vi.fn(), searchTracks: vi.fn() }));

import { lookupTrack, searchTracks } from "@/lib/songs/itunes";
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
    const r = await lookupFromUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
    expect(r).toEqual({ status: "error", reason: "unsupported_service", service: "spotify" });
  });

  it("通信エラーは network、見つからなければ not_found", async () => {
    vi.mocked(lookupTrack).mockRejectedValueOnce(new Error("timeout"));
    expect(await lookupFromUrl(url(5))).toEqual({ status: "error", reason: "network" });
    vi.mocked(lookupTrack).mockResolvedValueOnce(null);
    expect(await lookupFromUrl(url(5))).toEqual({ status: "error", reason: "not_found" });
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
