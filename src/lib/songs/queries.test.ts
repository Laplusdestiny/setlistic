import { describe, expect, it } from "vitest";
import { EMPTY_CONDITIONS } from "../search/conditions";
import { fakeSupabase } from "@/test/fake-supabase";
import {
  getSingState,
  getSong,
  getSongQuota,
  getUserSettings,
  isAppAdmin,
  isTutorialPending,
  listCustomFields,
  listSavedSearches,
  listTagsWithCount,
  searchSongs,
} from "./queries";

const client = (opts: Parameters<typeof fakeSupabase>[0]) => {
  const sb = fakeSupabase(opts);
  return { sb, c: sb.client as never };
};

describe("searchSongs", () => {
  it("search_songs の行を SongRow にする（null の tags/fields は空にする）", async () => {
    const { sb, c } = client({
      rpc: {
        search_songs: {
          data: [
            {
              id: "s1",
              title: "夜に駆ける",
              artist: "YOASOBI",
              song_key: -1,
              practice_priority: 2,
              memo: null,
              apple_url: null,
              last_sung_at: "2026-10-01",
              sung_count: 2,
              tags: null,
              fields: null,
            },
          ],
        },
      },
    });
    expect(await searchSongs(c, EMPTY_CONDITIONS, "created_desc")).toEqual([
      {
        id: "s1",
        title: "夜に駆ける",
        artist: "YOASOBI",
        songKey: -1,
        practicePriority: 2,
        memo: null,
        appleUrl: null,
        lastSungAt: "2026-10-01",
        sungCount: 2,
        tags: [],
        fields: {},
      },
    ]);
    expect(sb.rpcCalls[0].name).toBe("search_songs");
    expect(sb.rpcCalls[0].args).toHaveProperty("p");
  });

  it("不正な practice_priority は null にする", async () => {
    const row = { id: "s1", title: "t", artist: "a", sung_count: 0, practice_priority: 5 };
    const { c } = client({ rpc: { search_songs: { data: [row] } } });
    expect((await searchSongs(c, EMPTY_CONDITIONS, "created_desc"))[0].practicePriority).toBeNull();
  });

  it("データなしは空配列、エラーは例外", async () => {
    expect(await searchSongs(client({}).c, EMPTY_CONDITIONS, "created_desc")).toEqual([]);
    const { c } = client({ rpc: { search_songs: { error: { code: "XX000" } } } });
    await expect(searchSongs(c, EMPTY_CONDITIONS, "created_desc")).rejects.toThrow(
      "曲の読み込みに失敗しました",
    );
  });
});

describe("getSong", () => {
  it("タグを名前順にし、空のタグ参照を捨て、項目値を辞書にする", async () => {
    const { sb, c } = client({
      tables: {
        songs: {
          data: {
            id: "s1",
            title: "t",
            artist: "a",
            song_key: null,
            memo: "m",
            apple_url: "https://music.apple.com/x",
            last_sung_at: null,
            sung_count: 0,
            tags: [
              { tag: { id: "2", name: "盛り上げ" } },
              { tag: null },
              { tag: { id: "1", name: "アニソン" } },
            ],
            field_values: [{ field_id: "f1", value: 3 }],
          },
        },
      },
    });
    const song = await getSong(c, "s1");
    expect(song?.tags.map((t) => t.name)).toEqual(["アニソン", "盛り上げ"]);
    expect(song?.fields).toEqual({ f1: 3 });
    expect(song?.appleUrl).toBe("https://music.apple.com/x");
    expect(sb.argsOf("songs", "eq")).toEqual([["id", "s1"]]);
  });

  it("tags/field_values が null でも読める。見つからなければ null", async () => {
    const { c } = client({
      tables: {
        songs: {
          data: {
            id: "s1",
            title: "t",
            artist: "a",
            sung_count: 0,
            tags: null,
            field_values: null,
          },
        },
      },
    });
    expect(await getSong(c, "s1")).toMatchObject({ tags: [], fields: {} });
    const withPriority = client({
      tables: {
        songs: { data: { id: "s1", title: "t", artist: "a", sung_count: 0, practice_priority: 1 } },
      },
    });
    expect(await getSong(withPriority.c, "s1")).toMatchObject({ practicePriority: 1 });
    expect(await getSong(client({}).c, "s1")).toBeNull();
  });
});

describe("getSingState", () => {
  it("記録と集計値をまとめる", async () => {
    const { c } = client({
      tables: {
        sing_logs: { data: [{ id: "l1", sung_at: "2026-10-12", ease: null, note: null }] },
        songs: { data: { sung_count: 1, last_sung_at: "2026-10-12" } },
      },
    });
    expect(await getSingState(c, "s1")).toEqual({
      logs: [{ id: "l1", sungAt: "2026-10-12", ease: null, note: null }],
      sungCount: 1,
      lastSungAt: "2026-10-12",
    });
  });

  it("何も取れなければ 0 件", async () => {
    expect(await getSingState(client({}).c, "s1")).toEqual({
      logs: [],
      sungCount: 0,
      lastSungAt: null,
    });
  });
});

describe("listSavedSearches", () => {
  it("保存済みの条件を安全な形で返す", async () => {
    const { c } = client({
      tables: { saved_searches: { data: [{ id: "q1", name: "十八番", conditions: null }] } },
    });
    const list = await listSavedSearches(c);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "q1", name: "十八番" });
    expect(await listSavedSearches(client({}).c)).toEqual([]);
  });
});

describe("listTagsWithCount", () => {
  it("使用曲数と別名を取り出す", async () => {
    const { c } = client({
      tables: {
        tags: {
          data: [
            {
              id: "t1",
              name: "アニソン",
              group_id: "g1",
              uses: [{ count: 5 }],
              aliases: [{ alias: "anison" }],
            },
            { id: "t2", name: "DAM", group_id: null, uses: null, aliases: null },
          ],
        },
      },
    });
    expect(await listTagsWithCount(c)).toEqual([
      { id: "t1", name: "アニソン", groupId: "g1", count: 5, aliases: ["anison"] },
      { id: "t2", name: "DAM", groupId: null, count: 0, aliases: [] },
    ]);
    expect(await listTagsWithCount(client({}).c)).toEqual([]);
  });
});

describe("listCustomFields", () => {
  it("知らない種類を捨て、選択肢は文字列だけ残す", async () => {
    const row = { sort_order: 0, show_in_list: true, hidden: false };
    const { c } = client({
      tables: {
        custom_fields: {
          data: [
            { ...row, id: "f1", name: "練習", field_type: "select", options: ["A", 1, "B"] },
            { ...row, id: "f2", name: "古い", field_type: "rating", options: null },
            { ...row, id: "f3", name: "メモ", field_type: "text", options: null },
          ],
        },
      },
    });
    expect(await listCustomFields(c)).toEqual([
      {
        id: "f1",
        name: "練習",
        type: "select",
        options: ["A", "B"],
        sortOrder: 0,
        showInList: true,
        hidden: false,
      },
      {
        id: "f3",
        name: "メモ",
        type: "text",
        options: [],
        sortOrder: 0,
        showInList: true,
        hidden: false,
      },
    ]);
  });
});

describe("isTutorialPending", () => {
  it("完了日時が null ならまだ。入っていれば済み", async () => {
    let { sb, c } = client({
      tables: { user_settings: { data: { tutorial_completed_at: null } } },
    });
    expect(await isTutorialPending(c, "user-1")).toBe(true);
    expect(sb.argsOf("user_settings", "eq")).toEqual([["user_id", "user-1"]]);
    ({ sb, c } = client({
      tables: { user_settings: { data: { tutorial_completed_at: "2026-10-18T00:00:00Z" } } },
    }));
    expect(await isTutorialPending(c, "user-1")).toBe(false);
  });

  it("設定の行が読めなければ済みとみなす", async () => {
    expect(await isTutorialPending(client({}).c, "user-1")).toBe(false);
  });
});

describe("getUserSettings", () => {
  it("保存済みの設定を読む", async () => {
    const { sb, c } = client({
      tables: {
        user_settings: {
          data: { list_sort: "created_asc", list_columns: ["tags", 1], default_tag_ids: ["t1"] },
        },
      },
    });
    expect(await getUserSettings(c, "user-1")).toEqual({
      listSort: "created_asc",
      listColumns: ["tags"],
      defaultTagIds: ["t1"],
    });
    expect(sb.argsOf("user_settings", "eq")).toEqual([["user_id", "user-1"]]);
  });

  it("未保存なら既定値", async () => {
    expect(await getUserSettings(client({}).c, "user-1")).toEqual({
      listSort: "created_desc",
      listColumns: ["key", "tags", "priority"],
      defaultTagIds: [],
    });
  });
});

describe("getSongQuota / isAppAdmin", () => {
  it("DB 関数の結果をそのまま解釈する", async () => {
    expect(
      await getSongQuota(client({ rpc: { song_quota: { data: { used: 3, max: 500 } } } }).c),
    ).toEqual({ used: 3, max: 500 });
    expect(await getSongQuota(client({}).c)).toBeNull();
    expect(await isAppAdmin(client({ rpc: { is_app_admin: { data: true } } }).c)).toBe(true);
    expect(await isAppAdmin(client({ rpc: { is_app_admin: { data: "true" } } }).c)).toBe(false);
  });
});
