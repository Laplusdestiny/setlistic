"use server";

import { validateInvite } from "@/lib/invites";
import { requireUser } from "@/lib/supabase/user";

type Result = { status: "ok" } | { status: "error"; message: string };

function message(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "この操作は管理者だけができます。";
  if (error.code === "22023") {
    if (error.message?.includes("too many"))
      return "招待は200件までです。不要なものを取り消してください。";
    if (error.message?.includes("yourself")) return "自分自身の招待は取り消せません。";
    if (error.message?.includes("email")) return "メールアドレスの形式が正しくありません。";
  }
  return "うまくいきませんでした。もう一度お試しください。";
}

/** 招待を追加する。メールアドレスは DB 関数の中でハッシュにされ、保存されない */
export async function addInviteAction(raw: unknown): Promise<Result> {
  const { supabase } = await requireUser();
  const v = validateInvite(raw);
  if (!v.ok) return { status: "error", message: v.error };

  const { error } = await supabase.rpc("admin_add_invite", {
    p_email: v.value.email,
    p_label: v.value.label,
  });
  return error ? { status: "error", message: message(error) } : { status: "ok" };
}

/** 招待を取り消す。deleteUser = true なら、そのユーザーのアカウントと全データも削除する */
export async function revokeInviteAction(input: {
  hash: string;
  deleteUser: boolean;
}): Promise<Result> {
  const { supabase } = await requireUser();
  if (typeof input?.hash !== "string" || !/^[0-9a-f]{64}$/.test(input.hash))
    return { status: "error", message: "対象が正しくありません。" };

  const { error } = await supabase.rpc("admin_revoke_invite", {
    p_hash: input.hash,
    p_delete_user: input.deleteUser === true,
  });
  return error ? { status: "error", message: message(error) } : { status: "ok" };
}
