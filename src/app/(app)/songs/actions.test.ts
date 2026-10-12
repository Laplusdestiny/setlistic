import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  todayJst: () => "2026-10-12",
}));

import { requireUser } from "@/lib/supabase/user";
import {
  deleteSingLogAction,
  deleteSongAction,
  loadSingStateAction,
  recordSingAction,
  updateSongAction,
} from "./actions";

const SONG = "11111111-1111-4111-8111-111111111111";
const LOG = "22222222-2222-4222-8222-222222222222";
const FIELD = "33333333-3333-4333-8333-333333333333";

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}

const singTables = {
  sing_logs: {
    data: [{ id: LOG, sung_at: "2026-10-12", ease: 4, note: "喉が温まっていた" }],
  },
  songs: { data: { sung_count: 3, last_sung_at: "2026-10-12" } },
};

beforeEach(() => setup());

describe("updateSongAction", () => {
  const input = {
    id: SONG,
    title: "夜に駆ける",
    artist: "YOASOBI",
    songKey: -2,
    memo: "  サビ注意 ",
    tagIds: [],
    newTags: [{ name: "十八番" }],
    fields: { [FIELD]: "高め", unknown: "捨てる" },
  };

  it("検証した値とカスタム項目を update_song に渡す", async () => {
    setup({
      tables: {
        custom_fields: {
          data: [
            {
              id: FIELD,
              name: "音域",
              field_type: "text",
              options: null,
              sort_order: 0,
              show_in_list: false,
              hidden: false,
            },
          ],
        },
      },
    });
    expect(await updateSongAction(input)).toEqual({ status: "ok" });
    expect(sb.rpcCalls).toEqual([
      {
        name: "update_song",
        args: {
          p_id: SONG,
          p_song: { title: "夜に駆ける", artist: "YOASOBI", song_key: -2, memo: "サビ注意" },
          p_tag_ids: [],
          p_new_tags: [{ name: "十八番", normalized: "十八番", group: undefined }],
          p_fields: { [FIELD]: "高め" },
        },
      },
    ]);
  });

  it("検証エラーは DB を呼ばずに返す", async () => {
    expect(await updateSongAction({ ...input, title: " " })).toEqual({
      status: "error",
      message: "曲名を入力してください",
    });
    expect(sb.rpcCalls).toEqual([]);
  });

  it("曲がない（P0002）ときは専用のメッセージ", async () => {
    setup({ rpc: { update_song: { error: { code: "P0002" } } } });
    expect(await updateSongAction(input)).toEqual({
      status: "error",
      message: "曲が見つかりません。",
    });
  });

  it("その他のエラーは汎用メッセージ", async () => {
    setup({ rpc: { update_song: { error: { code: "XX000" } } } });
    expect(await updateSongAction(input)).toMatchObject({
      status: "error",
      message: "保存できませんでした。もう一度お試しください。",
    });
  });
});

describe("deleteSongAction", () => {
  it("UUID でない ID は削除しない", async () => {
    expect(await deleteSongAction("x")).toEqual({
      status: "error",
      message: "曲が見つかりません。",
    });
    expect(sb.calls).toEqual([]);
  });

  it("自分の曲を ID で削除する", async () => {
    expect(await deleteSongAction(SONG)).toEqual({ status: "ok" });
    expect(sb.argsOf("songs", "eq")).toEqual([["id", SONG]]);
    expect(sb.find("songs", "delete")).toHaveLength(1);
  });

  it("DB エラーは失敗として返す", async () => {
    setup({ tables: { songs: { error: { code: "XX000" } } } });
    expect(await deleteSongAction(SONG)).toMatchObject({ status: "error" });
  });
});

describe("loadSingStateAction", () => {
  it("不正な ID は null", async () => {
    expect(await loadSingStateAction("../etc")).toBeNull();
  });

  it("歌唱記録と集計値を返す", async () => {
    setup({ tables: singTables });
    expect(await loadSingStateAction(SONG)).toEqual({
      logs: [{ id: LOG, sungAt: "2026-10-12", ease: 4, note: "喉が温まっていた" }],
      sungCount: 3,
      lastSungAt: "2026-10-12",
    });
  });
});

describe("recordSingAction", () => {
  it("日付省略で今日（JST）として記録し、最新の状態を返す", async () => {
    setup({ tables: singTables });
    const r = await recordSingAction({ songId: SONG, ease: 4, note: " よかった " });
    expect(r).toMatchObject({ status: "ok", state: { sungCount: 3 } });
    expect(sb.argsOf("sing_logs", "insert")).toEqual([
      [{ user_id: "user-1", song_id: SONG, sung_at: "2026-10-12", ease: 4, note: "よかった" }],
    ]);
  });

  it("未来の日付は記録しない", async () => {
    expect(await recordSingAction({ songId: SONG, sungAt: "2026-10-13" })).toEqual({
      status: "error",
      message: "未来の日付は記録できません",
    });
    expect(sb.calls).toEqual([]);
  });

  it("insert の失敗は汎用メッセージ", async () => {
    setup({ tables: { sing_logs: { error: { code: "23503" } } } });
    expect(await recordSingAction({ songId: SONG })).toMatchObject({ status: "error" });
  });
});

describe("deleteSingLogAction", () => {
  it("曲IDと記録IDの両方で絞って削除する", async () => {
    setup({ tables: { ...singTables, sing_logs: [{}, singTables.sing_logs] } });
    const r = await deleteSingLogAction(SONG, LOG);
    expect(r).toMatchObject({ status: "ok", state: { lastSungAt: "2026-10-12" } });
    expect(sb.argsOf("sing_logs", "delete")).toHaveLength(1);
    const del = sb.find("sing_logs", "delete")[0];
    expect(del.ops.filter(([m]) => m === "eq")).toEqual([
      ["eq", "id", LOG],
      ["eq", "song_id", SONG],
    ]);
  });

  it("どちらかが不正な ID なら何もしない", async () => {
    expect(await deleteSingLogAction(SONG, "1")).toEqual({
      status: "error",
      message: "記録が見つかりません。",
    });
    expect(sb.calls).toEqual([]);
  });

  it("削除の失敗を返す", async () => {
    setup({ tables: { sing_logs: { error: { code: "XX000" } } } });
    expect(await deleteSingLogAction(SONG, LOG)).toEqual({
      status: "error",
      message: "削除できませんでした。もう一度お試しください。",
    });
  });
});
