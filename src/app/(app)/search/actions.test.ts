import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));

import { requireUser } from "@/lib/supabase/user";
import { deleteSavedSearchAction, saveSearchAction } from "./actions";

const ID = "11111111-1111-4111-8111-111111111111";

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}
beforeEach(() => setup());

describe("saveSearchAction", () => {
  const input = { name: "  十八番  だけ ", conditions: { q: "夜" } };

  it("件数を sort_order にして末尾に保存する", async () => {
    setup({ tables: { saved_searches: [{ count: 2 }, {}] } });
    expect(await saveSearchAction(input)).toEqual({ status: "ok" });
    const [row] = sb.argsOf("saved_searches", "insert")[0] as [Record<string, unknown>];
    expect(row).toMatchObject({ user_id: "user-1", name: "十八番 だけ", sort_order: 2 });
    expect(row.conditions).toMatchObject({ q: "夜" });
  });

  it("件数が取れなければ 0 とみなす", async () => {
    expect(await saveSearchAction(input)).toEqual({ status: "ok" });
    expect(sb.argsOf("saved_searches", "insert")[0][0]).toMatchObject({ sort_order: 0 });
  });

  it("検証エラー・上限・保存失敗", async () => {
    expect(await saveSearchAction({ name: "", conditions: {} })).toEqual({
      status: "error",
      message: "名前を入力してください",
    });
    setup({ tables: { saved_searches: { count: 30 } } });
    expect(await saveSearchAction(input)).toMatchObject({
      message: expect.stringContaining("30件まで"),
    });
    expect(sb.find("saved_searches", "insert")).toEqual([]);
    setup({ tables: { saved_searches: [{ count: 0 }, { error: { code: "XX000" } }] } });
    expect(await saveSearchAction(input)).toEqual({
      status: "error",
      message: "保存できませんでした。もう一度お試しください。",
    });
  });
});

describe("deleteSavedSearchAction", () => {
  it("ID で消す", async () => {
    expect(await deleteSavedSearchAction(ID)).toEqual({ status: "ok" });
    expect(sb.argsOf("saved_searches", "eq")).toEqual([["id", ID]]);
  });

  it("不正な ID と失敗", async () => {
    expect(await deleteSavedSearchAction(1 as never)).toEqual({
      status: "error",
      message: "見つかりません",
    });
    setup({ tables: { saved_searches: { error: { code: "XX000" } } } });
    expect(await deleteSavedSearchAction(ID)).toEqual({
      status: "error",
      message: "削除できませんでした。",
    });
  });
});
