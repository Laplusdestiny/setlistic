import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));

import { requireUser } from "@/lib/supabase/user";
import {
  addAliasAction,
  addKaraokeTagsAction,
  createGroupAction,
  createTagAction,
  deleteGroupAction,
  deleteTagAction,
  mergeTagsAction,
  moveTagAction,
  removeAliasAction,
  renameGroupAction,
  renameTagAction,
  reorderGroupsAction,
  reorderTagsAction,
} from "./actions";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const G1 = "33333333-3333-4333-8333-333333333333";
const ok = { status: "ok" };
const err = (message: string) => ({ status: "error", message });
const FAILED = err("保存できませんでした。もう一度お試しください。");

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}
beforeEach(() => setup());

describe("createTagAction", () => {
  it("正規化した名前で、グループの末尾に作る", async () => {
    setup({ tables: { tags: [{ data: [{ id: T1, name: "アニソン" }] }, {}] } });
    expect(await createTagAction({ name: "#十八番", groupId: G1 })).toEqual(ok);
    expect(sb.argsOf("tags", "insert")).toEqual([
      [
        {
          user_id: "user-1",
          group_id: G1,
          name: "十八番",
          normalized_name: "十八番",
          sort_order: 1,
        },
      ],
    ]);
  });

  it("不正なグループIDはグループなしにする", async () => {
    await createTagAction({ name: "x", groupId: "bad" });
    expect(sb.argsOf("tags", "insert")[0][0]).toMatchObject({ group_id: null, sort_order: 0 });
  });

  it("名前の検証", async () => {
    expect(await createTagAction({ name: "  ", groupId: null })).toEqual(
      err("タグ名を入力してください"),
    );
    expect(await createTagAction({ name: "あ".repeat(100), groupId: null })).toMatchObject({
      status: "error",
      message: expect.stringContaining("文字までです"),
    });
  });

  it("全角半角・大小の違いだけの同名タグは作らない", async () => {
    setup({ tables: { tags: { data: [{ id: T1, name: "DAM" }] } } });
    expect(await createTagAction({ name: "ｄａｍ", groupId: null })).toEqual(
      err("同じ名前のタグがあります"),
    );
  });

  it("一意制約違反と、その他のエラー", async () => {
    setup({ tables: { tags: [{ data: [] }, { error: { code: "23505" } }] } });
    expect(await createTagAction({ name: "x", groupId: null })).toEqual(
      err("同じ名前のタグがあります"),
    );
    setup({ tables: { tags: [{ data: [] }, { error: { code: "XX000" } }] } });
    expect(await createTagAction({ name: "x", groupId: null })).toEqual(FAILED);
  });
});

describe("renameTagAction", () => {
  it("名前と正規化名を更新する", async () => {
    setup({ tables: { tags: { data: [{ id: T1, name: "old" }] } } });
    expect(await renameTagAction({ id: T1, name: "New" })).toEqual(ok);
    expect(sb.argsOf("tags", "update")).toEqual([[{ name: "New", normalized_name: "new" }]]);
  });

  it("不正ID・名前の衝突・DB エラー", async () => {
    expect(await renameTagAction({ id: "x", name: "a" })).toEqual(err("タグが見つかりません"));
    setup({
      tables: {
        tags: {
          data: [
            { id: T1, name: "a" },
            { id: T2, name: "b" },
          ],
        },
      },
    });
    expect(await renameTagAction({ id: T1, name: "B" })).toMatchObject({ status: "error" });
    setup({ tables: { tags: [{ data: [] }, { error: { code: "23505" } }] } });
    expect(await renameTagAction({ id: T1, name: "c" })).toEqual(err("同じ名前のタグがあります"));
    setup({ tables: { tags: [{ data: [] }, { error: { code: "XX000" } }] } });
    expect(await renameTagAction({ id: T1, name: "c" })).toEqual(FAILED);
  });
});

describe("moveTagAction", () => {
  it("移動先グループの件数を sort_order にする", async () => {
    setup({ tables: { tags: [{ count: 4 }, {}] } });
    expect(await moveTagAction({ id: T1, groupId: G1 })).toEqual(ok);
    expect(sb.argsOf("tags", "update")).toEqual([[{ group_id: G1, sort_order: 4 }]]);
  });

  it("グループなし（null）へも移せる", async () => {
    expect(await moveTagAction({ id: T1, groupId: null })).toEqual(ok);
    expect(sb.argsOf("tags", "update")[0][0]).toEqual({ group_id: null, sort_order: 0 });
  });

  it("不正な ID と更新失敗", async () => {
    expect(await moveTagAction({ id: T1, groupId: "x" })).toEqual(err("タグが見つかりません"));
    setup({ tables: { tags: [{ count: 0 }, { error: { code: "XX000" } }] } });
    expect(await moveTagAction({ id: T1, groupId: null })).toEqual(FAILED);
  });
});

describe("addAliasAction / removeAliasAction", () => {
  const tags = { data: [{ id: T1, name: "アニソン" }] };

  it("別名を追加する", async () => {
    setup({ tables: { tags, tag_aliases: [{ data: [{ alias: "anison" }] }, {}] } });
    expect(await addAliasAction({ tagId: T1, alias: "アニメソング" })).toEqual(ok);
    expect(sb.argsOf("tag_aliases", "insert")[0][0]).toMatchObject({
      tag_id: T1,
      alias: "アニメソング",
    });
  });

  it("タグがない・検証エラー・重複・失敗", async () => {
    expect(await addAliasAction({ tagId: "x", alias: "a" })).toEqual(err("タグが見つかりません"));
    setup({ tables: { tags: { data: [] } } });
    expect(await addAliasAction({ tagId: T1, alias: "a" })).toEqual(err("タグが見つかりません"));
    setup({ tables: { tags } });
    expect(await addAliasAction({ tagId: T1, alias: "アニソン" })).toEqual(err("タグ名と同じです"));
    setup({ tables: { tags, tag_aliases: [{ data: [] }, { error: { code: "23505" } }] } });
    expect(await addAliasAction({ tagId: T1, alias: "b" })).toEqual(err("すでに登録されています"));
    setup({ tables: { tags, tag_aliases: [{ data: [] }, { error: { code: "XX000" } }] } });
    expect(await addAliasAction({ tagId: T1, alias: "b" })).toEqual(FAILED);
  });

  it("別名は正規化した値で消す", async () => {
    expect(await removeAliasAction({ tagId: T1, alias: "ＡＢＣ" })).toEqual(ok);
    expect(sb.argsOf("tag_aliases", "eq")).toEqual([["tag_id", T1]]);
    expect(sb.find("tag_aliases", "delete")[0].ops).toContainEqual([
      "eq",
      "normalized_alias",
      "abc",
    ]);
  });

  it("removeAlias の不正入力と失敗", async () => {
    expect(await removeAliasAction({ tagId: T1, alias: 1 as never })).toEqual(
      err("別名が見つかりません"),
    );
    setup({ tables: { tag_aliases: { error: { code: "XX000" } } } });
    expect(await removeAliasAction({ tagId: T1, alias: "a" })).toEqual(FAILED);
  });
});

describe("RPC を呼ぶ操作", () => {
  it("mergeTagsAction", async () => {
    expect(await mergeTagsAction({ sourceId: T1, targetId: T2 })).toEqual(ok);
    expect(sb.rpcCalls).toEqual([{ name: "merge_tags", args: { p_source: T1, p_target: T2 } }]);
    expect(await mergeTagsAction({ sourceId: T1, targetId: "x" })).toEqual(
      err("タグが見つかりません"),
    );
    setup({ rpc: { merge_tags: { error: { code: "P0002" } } } });
    expect(await mergeTagsAction({ sourceId: T1, targetId: T2 })).toEqual(
      err("タグが見つかりません"),
    );
    setup({ rpc: { merge_tags: { error: { code: "XX000" } } } });
    expect(await mergeTagsAction({ sourceId: T1, targetId: T2 })).toEqual(FAILED);
  });

  it("deleteTagAction", async () => {
    expect(await deleteTagAction(T1)).toEqual(ok);
    expect(sb.rpcCalls).toEqual([{ name: "delete_tag", args: { p_id: T1 } }]);
    expect(await deleteTagAction("x")).toEqual(err("タグが見つかりません"));
    setup({ rpc: { delete_tag: { error: { code: "P0002" } } } });
    expect(await deleteTagAction(T1)).toEqual(err("タグが見つかりません"));
    setup({ rpc: { delete_tag: { error: { code: "XX000" } } } });
    expect(await deleteTagAction(T1)).toEqual(err("削除できませんでした。"));
  });

  it.each([
    ["reorderTagsAction", reorderTagsAction, "reorder_tags"],
    ["reorderGroupsAction", reorderGroupsAction, "reorder_tag_groups"],
  ] as const)("%s", async (_, action, rpc) => {
    expect(await action([T1, T2])).toEqual(ok);
    expect(sb.rpcCalls).toEqual([{ name: rpc, args: { p_ids: [T1, T2] } }]);
    expect(await action([T1, "x"])).toEqual(err("並べ替えできませんでした"));
    expect(await action("x" as never)).toEqual(err("並べ替えできませんでした"));
    setup({ rpc: { [rpc]: { error: { code: "XX000" } } } });
    expect(await action([T1])).toEqual(FAILED);
  });
});

describe("createGroupAction", () => {
  it("グループを作り、指定のタグをそこへ移す", async () => {
    setup({
      tables: {
        tag_groups: [{ data: [{ id: "g0", name: "ジャンル" }] }, { data: { id: G1 } }],
        tags: [{ count: 0 }, {}],
      },
    });
    expect(await createGroupAction({ name: "気分", tagId: T1 })).toEqual(ok);
    expect(sb.argsOf("tag_groups", "insert")).toEqual([
      [{ user_id: "user-1", name: "気分", sort_order: 1 }],
    ]);
    expect(sb.argsOf("tags", "update")).toEqual([[{ group_id: G1, sort_order: 0 }]]);
  });

  it("タグ指定なしなら移動しない", async () => {
    setup({ tables: { tag_groups: [{ data: [] }, { data: { id: G1 } }] } });
    expect(await createGroupAction({ name: "気分" })).toEqual(ok);
    expect(sb.find("tags", "update")).toEqual([]);
  });

  it("入力エラー・同名・作成失敗・移動失敗", async () => {
    expect(await createGroupAction({ name: "x", tagId: "bad" })).toEqual(
      err("タグが見つかりません"),
    );
    expect(await createGroupAction({ name: " " })).toEqual(err("グループ名を入力してください"));
    setup({ tables: { tag_groups: [{ data: [] }, { error: { code: "23505" } }] } });
    expect(await createGroupAction({ name: "x" })).toEqual(err("同じ名前のグループがあります"));
    setup({ tables: { tag_groups: [{ data: [] }, { data: null }] } });
    expect(await createGroupAction({ name: "x" })).toEqual(FAILED);
    setup({
      tables: {
        tag_groups: [{ data: [] }, { data: { id: G1 } }],
        tags: [{ count: 0 }, { error: { code: "XX000" } }],
      },
    });
    expect(await createGroupAction({ name: "x", tagId: T1 })).toEqual(
      err("グループは作りましたが、タグを移せませんでした"),
    );
  });
});

describe("addKaraokeTagsAction", () => {
  it("グループがなければ作ってから DAM・JOYSOUND を入れる", async () => {
    setup({
      tables: {
        tag_groups: [{ data: [] }, { data: { id: G1 } }],
        tags: [{ data: [{ id: T1, name: "x" }] }, {}],
      },
    });
    expect(await addKaraokeTagsAction()).toEqual(ok);
    expect(sb.argsOf("tag_groups", "insert")[0][0]).toMatchObject({ name: "カラオケ機種" });
    expect(sb.argsOf("tags", "insert")[0][0]).toEqual([
      { user_id: "user-1", group_id: G1, name: "DAM", normalized_name: "dam", sort_order: 1 },
      {
        user_id: "user-1",
        group_id: G1,
        name: "JOYSOUND",
        normalized_name: "joysound",
        sort_order: 2,
      },
    ]);
  });

  it("既存のグループを使い、ないタグだけ作る", async () => {
    setup({
      tables: {
        tag_groups: { data: [{ id: G1, name: "カラオケ機種" }] },
        tags: [{ data: [{ id: T1, name: "dam" }] }, {}],
      },
    });
    expect(await addKaraokeTagsAction()).toEqual(ok);
    expect(sb.find("tag_groups", "insert")).toEqual([]);
    expect(sb.argsOf("tags", "insert")[0][0]).toMatchObject([{ name: "JOYSOUND" }]);
  });

  it("全部そろっていれば何もしない", async () => {
    setup({
      tables: {
        tag_groups: { data: [] },
        tags: {
          data: [
            { id: T1, name: "DAM" },
            { id: T2, name: "JOYSOUND" },
          ],
        },
      },
    });
    expect(await addKaraokeTagsAction()).toEqual(ok);
    expect(sb.find("tags", "insert")).toEqual([]);
  });

  it("グループ作成・タグ作成の失敗", async () => {
    setup({ tables: { tag_groups: [{ data: [] }, { error: { code: "XX000" } }] } });
    expect(await addKaraokeTagsAction()).toEqual(FAILED);
    setup({
      tables: {
        tag_groups: { data: [{ id: G1, name: "カラオケ機種" }] },
        tags: [{ data: [] }, { error: { code: "XX000" } }],
      },
    });
    expect(await addKaraokeTagsAction()).toEqual(FAILED);
  });
});

describe("renameGroupAction / deleteGroupAction", () => {
  it("名前を変える", async () => {
    setup({ tables: { tag_groups: { data: [{ id: G1, name: "old" }] } } });
    expect(await renameGroupAction({ id: G1, name: "new" })).toEqual(ok);
    expect(sb.argsOf("tag_groups", "update")).toEqual([[{ name: "new" }]]);
  });

  it("rename の失敗系", async () => {
    expect(await renameGroupAction({ id: "x", name: "a" })).toEqual(
      err("グループが見つかりません"),
    );
    expect(await renameGroupAction({ id: G1, name: "" })).toEqual(
      err("グループ名を入力してください"),
    );
    setup({ tables: { tag_groups: [{ data: [] }, { error: { code: "23505" } }] } });
    expect(await renameGroupAction({ id: G1, name: "a" })).toEqual(
      err("同じ名前のグループがあります"),
    );
    setup({ tables: { tag_groups: [{ data: [] }, { error: { code: "XX000" } }] } });
    expect(await renameGroupAction({ id: G1, name: "a" })).toEqual(FAILED);
  });

  it("グループを消す", async () => {
    expect(await deleteGroupAction(G1)).toEqual(ok);
    expect(sb.argsOf("tag_groups", "eq")).toEqual([["id", G1]]);
    expect(await deleteGroupAction("x")).toEqual(err("グループが見つかりません"));
    setup({ tables: { tag_groups: { error: { code: "XX000" } } } });
    expect(await deleteGroupAction(G1)).toEqual(err("削除できませんでした。"));
  });
});
