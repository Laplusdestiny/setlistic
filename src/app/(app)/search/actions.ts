"use server";

import { SAVED_MAX, toSavedSearchPayload } from "@/lib/search/saved";
import { UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";

type Result = { status: "ok" } | { status: "error"; message: string };

export async function saveSearchAction(raw: unknown): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const payload = toSavedSearchPayload(raw);
  if (!payload.ok) return { status: "error", message: payload.error };

  const { count } = await supabase
    .from("saved_searches")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= SAVED_MAX)
    return {
      status: "error",
      message: `保存できる条件は${SAVED_MAX}件までです。不要なものを削除してください。`,
    };

  const { error } = await supabase.from("saved_searches").insert({
    user_id: userId,
    name: payload.value.name,
    conditions: payload.value.conditions,
    sort_order: count ?? 0,
  });
  return error
    ? { status: "error", message: "保存できませんでした。もう一度お試しください。" }
    : { status: "ok" };
}

export async function deleteSavedSearchAction(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  if (typeof id !== "string" || !UUID_PATTERN.test(id))
    return { status: "error", message: "見つかりません" };
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  return error ? { status: "error", message: "削除できませんでした。" } : { status: "ok" };
}
