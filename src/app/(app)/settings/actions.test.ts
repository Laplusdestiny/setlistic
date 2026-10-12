import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));

import { requireUser } from "@/lib/supabase/user";
import {
  createFieldAction,
  deleteAccountAction,
  deleteFieldAction,
  reorderFieldsAction,
  saveDisplaySettingsAction,
  updateFieldAction,
} from "./actions";

const F1 = "11111111-1111-4111-8111-111111111111";
const F2 = "22222222-2222-4222-8222-222222222222";
const TAG = "33333333-3333-4333-8333-333333333333";
const ok = { status: "ok" };
const err = (message: string) => ({ status: "error", message });
const FAILED = err("保存できませんでした。もう一度お試しください。");

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}
beforeEach(() => setup());

describe("saveDisplaySettingsAction", () => {
  it("知らない列を捨て、自分のタグだけを残して保存する", async () => {
    setup({ tables: { tags: { data: [{ id: TAG }] } } });
    const r = await saveDisplaySettingsAction({
      listSort: "created_asc",
      listColumns: ["tags", "evil"],
      defaultTagIds: [TAG, "not-uuid", F1],
    });
    expect(r).toEqual(ok);
    expect(sb.argsOf("tags", "in")).toEqual([["id", [TAG, F1]]]);
    const [row, opt] = sb.argsOf("user_settings", "upsert")[0];
    expect(row).toMatchObject({
      user_id: "user-1",
      list_sort: "created_asc",
      list_columns: ["tags"],
      default_tag_ids: [TAG],
    });
    expect(opt).toEqual({ onConflict: "user_id" });
  });

  it("タグ指定なしならタグを問い合わせない", async () => {
    await saveDisplaySettingsAction({
      listSort: "created_asc",
      listColumns: null as never,
      defaultTagIds: null as never,
    });
    expect(sb.find("tags", "select")).toEqual([]);
    expect(sb.argsOf("user_settings", "upsert")[0][0]).toMatchObject({
      list_columns: [],
      default_tag_ids: [],
    });
  });

  it("並び順の検証と保存失敗", async () => {
    expect(
      await saveDisplaySettingsAction({ listSort: "x", listColumns: [], defaultTagIds: [] }),
    ).toEqual(err("並び順が正しくありません"));
    setup({ tables: { user_settings: { error: { code: "XX000" } } } });
    expect(
      await saveDisplaySettingsAction({
        listSort: "created_asc",
        listColumns: [],
        defaultTagIds: [],
      }),
    ).toEqual(FAILED);
  });
});

describe("createFieldAction", () => {
  it("末尾に項目を追加する", async () => {
    setup({ tables: { custom_fields: [{ data: [{ name: "音域" }] }, {}] } });
    expect(
      await createFieldAction({ name: "練習中", type: "select", options: ["A", "B", "A"] }),
    ).toEqual(ok);
    expect(sb.argsOf("custom_fields", "insert")).toEqual([
      [
        {
          user_id: "user-1",
          name: "練習中",
          field_type: "select",
          options: ["A", "B"],
          sort_order: 1,
        },
      ],
    ]);
  });

  it("上限・検証・一意制約・その他のエラー", async () => {
    setup({
      tables: {
        custom_fields: { data: Array.from({ length: 20 }, (_, i) => ({ name: `f${i}` })) },
      },
    });
    expect(await createFieldAction({ name: "x", type: "text", options: [] })).toEqual(
      err("項目は20個までです"),
    );
    setup({ tables: { custom_fields: { data: [{ name: "音域" }] } } });
    expect(await createFieldAction({ name: "音域", type: "text", options: [] })).toEqual(
      err("同じ名前の項目があります"),
    );
    setup({ tables: { custom_fields: [{ data: null }, { error: { code: "23505" } }] } });
    expect(await createFieldAction({ name: "x", type: "text", options: [] })).toEqual(
      err("同じ名前の項目があります"),
    );
    setup({ tables: { custom_fields: [{ data: [] }, { error: { code: "XX000" } }] } });
    expect(await createFieldAction({ name: "x", type: "text", options: [] })).toEqual(FAILED);
  });
});

describe("updateFieldAction", () => {
  const all = {
    data: [
      { id: F1, name: "音域", field_type: "select" },
      { id: F2, name: "メモ2", field_type: "text" },
    ],
  };

  it("種類は保存済みのものを使い、選択肢と表示設定を更新する", async () => {
    setup({ tables: { custom_fields: [all, {}] } });
    const r = await updateFieldAction({
      id: F1,
      name: "音域 ",
      options: ["低", "高"],
      showInList: true,
      hidden: "yes" as never,
    });
    expect(r).toEqual(ok);
    expect(sb.argsOf("custom_fields", "update")).toEqual([
      [{ name: "音域", options: ["低", "高"], show_in_list: true, hidden: false }],
    ]);
  });

  it("選択肢のない種類は options を書かない", async () => {
    setup({ tables: { custom_fields: [all, {}] } });
    await updateFieldAction({ id: F2, name: "メモ3", showInList: false, hidden: true });
    expect(sb.argsOf("custom_fields", "update")[0][0]).toEqual({
      name: "メモ3",
      show_in_list: false,
      hidden: true,
    });
  });

  it("ID 不正・項目なし・名前の衝突・DB エラー", async () => {
    const base = { name: "x", showInList: false, hidden: false };
    expect(await updateFieldAction({ ...base, id: "x" })).toEqual(err("項目が見つかりません"));
    setup({ tables: { custom_fields: { data: [] } } });
    expect(await updateFieldAction({ ...base, id: F1 })).toEqual(err("項目が見つかりません"));
    setup({ tables: { custom_fields: all } });
    expect(await updateFieldAction({ ...base, id: F2, name: "音域" })).toEqual(
      err("同じ名前の項目があります"),
    );
    setup({ tables: { custom_fields: [all, { error: { code: "23505" } }] } });
    expect(await updateFieldAction({ ...base, id: F2 })).toEqual(err("同じ名前の項目があります"));
    setup({ tables: { custom_fields: [all, { error: { code: "XX000" } }] } });
    expect(await updateFieldAction({ ...base, id: F2 })).toEqual(FAILED);
  });
});

describe("deleteFieldAction / reorderFieldsAction", () => {
  it("項目を消す", async () => {
    expect(await deleteFieldAction(F1)).toEqual(ok);
    expect(sb.argsOf("custom_fields", "eq")).toEqual([["id", F1]]);
    expect(await deleteFieldAction("x")).toEqual(err("項目が見つかりません"));
    setup({ tables: { custom_fields: { error: { code: "XX000" } } } });
    expect(await deleteFieldAction(F1)).toEqual(err("削除できませんでした。"));
  });

  it("並べ替え", async () => {
    expect(await reorderFieldsAction([F2, F1])).toEqual(ok);
    expect(sb.rpcCalls).toEqual([{ name: "reorder_custom_fields", args: { p_ids: [F2, F1] } }]);
    expect(await reorderFieldsAction([F1, "x"])).toEqual(err("並べ替えできませんでした"));
    setup({ rpc: { reorder_custom_fields: { error: { code: "XX000" } } } });
    expect(await reorderFieldsAction([F1])).toEqual(FAILED);
  });
});

describe("deleteAccountAction", () => {
  it("確認の文字が違えば何もしない", async () => {
    expect(await deleteAccountAction("けす")).toEqual(err("確認のため「削除」と入力してください"));
    expect(sb.rpcCalls).toEqual([]);
  });

  it("自分のアカウントを消し、ログアウトしてログイン画面へ送る", async () => {
    await expect(deleteAccountAction("削除")).rejects.toThrow("REDIRECT /login?deleted=1");
    expect(sb.rpcCalls).toEqual([{ name: "delete_my_account", args: undefined }]);
    expect(sb.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("ログアウトが失敗しても削除は完了として扱う", async () => {
    sb.client.auth.signOut.mockRejectedValueOnce(new Error("user not found"));
    await expect(deleteAccountAction("削除")).rejects.toThrow("REDIRECT /login?deleted=1");
  });

  it("削除に失敗したらログアウトしない", async () => {
    setup({ rpc: { delete_my_account: { error: { code: "XX000" } } } });
    expect(await deleteAccountAction("削除")).toEqual(
      err("削除できませんでした。時間をおいてもう一度お試しください。"),
    );
    expect(sb.client.auth.signOut).not.toHaveBeenCalled();
  });
});
