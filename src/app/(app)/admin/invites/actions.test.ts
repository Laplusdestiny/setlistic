import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));

import { requireUser } from "@/lib/supabase/user";
import { addInviteAction, revokeInviteAction } from "./actions";

const HASH = "a".repeat(64);

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}
beforeEach(() => setup());

describe("addInviteAction", () => {
  it("小文字にしたメールとメモを DB 関数に渡す", async () => {
    expect(await addInviteAction({ email: " Friend@Example.com ", label: "大学" })).toEqual({
      status: "ok",
    });
    expect(sb.rpcCalls).toEqual([
      { name: "admin_add_invite", args: { p_email: "friend@example.com", p_label: "大学" } },
    ]);
  });

  it("検証エラーは DB を呼ばない", async () => {
    expect(await addInviteAction({ email: "x" })).toMatchObject({ status: "error" });
    expect(sb.rpcCalls).toEqual([]);
  });

  it.each([
    [{ code: "42501" }, "この操作は管理者だけができます。"],
    [
      { code: "22023", message: "too many invites" },
      "招待は200件までです。不要なものを取り消してください。",
    ],
    [{ code: "22023", message: "cannot revoke yourself" }, "自分自身の招待は取り消せません。"],
    [{ code: "22023", message: "invalid email" }, "メールアドレスの形式が正しくありません。"],
    [{ code: "22023", message: "other" }, "うまくいきませんでした。もう一度お試しください。"],
    [{ code: "XX000" }, "うまくいきませんでした。もう一度お試しください。"],
  ])("DB のエラー %o をメッセージにする", async (error, message) => {
    setup({ rpc: { admin_add_invite: { error } } });
    expect(await addInviteAction({ email: "a@b.cd" })).toEqual({ status: "error", message });
  });
});

describe("revokeInviteAction", () => {
  it("ハッシュと削除フラグを渡す（true 以外は false）", async () => {
    expect(await revokeInviteAction({ hash: HASH, deleteUser: true })).toEqual({ status: "ok" });
    await revokeInviteAction({ hash: HASH, deleteUser: "yes" as never });
    expect(sb.rpcCalls.map((c) => c.args)).toEqual([
      { p_hash: HASH, p_delete_user: true },
      { p_hash: HASH, p_delete_user: false },
    ]);
  });

  it("ハッシュの形式が違えば何もしない", async () => {
    expect(await revokeInviteAction({ hash: "ABC", deleteUser: false })).toEqual({
      status: "error",
      message: "対象が正しくありません。",
    });
    expect(sb.rpcCalls).toEqual([]);
  });

  it("DB のエラーを返す", async () => {
    setup({ rpc: { admin_revoke_invite: { error: { code: "42501" } } } });
    expect(await revokeInviteAction({ hash: HASH, deleteUser: false })).toEqual({
      status: "error",
      message: "この操作は管理者だけができます。",
    });
  });
});
