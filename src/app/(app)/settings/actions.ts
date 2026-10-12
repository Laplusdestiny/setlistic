"use server";

import { redirect } from "next/navigation";
import { FIELD_MAX_COUNT, validateFieldDefinition } from "@/lib/custom-fields";
import { SORT_KEYS } from "@/lib/songs/sort";
import { UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";

type Result = { status: "ok" } | { status: "error"; message: string };
const ok: Result = { status: "ok" };
const fail = (message: string): Result => ({ status: "error", message });
const FAILED = fail("保存できませんでした。もう一度お試しください。");
const isId = (v: unknown): v is string => typeof v === "string" && UUID_PATTERN.test(v);

const COLUMNS = ["key", "tags"];

/** 表示設定：一覧の並び順、一覧に出す基本項目、登録時に付けるタグ */
export async function saveDisplaySettingsAction(input: {
  listSort: string;
  listColumns: string[];
  defaultTagIds: string[];
}): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const listSort = SORT_KEYS.find((k) => k === input?.listSort);
  if (!listSort) return fail("並び順が正しくありません");
  const listColumns = COLUMNS.filter(
    (c) => Array.isArray(input.listColumns) && input.listColumns.includes(c),
  );
  const wanted = Array.isArray(input.defaultTagIds) ? input.defaultTagIds.filter(isId) : [];

  // 自分のタグだけを残す（RLS により他人のタグは見えない）
  const { data: mine } = wanted.length
    ? await supabase.from("tags").select("id").in("id", wanted)
    : { data: [] as { id: string }[] };
  const defaultTagIds = (mine ?? []).map((t) => t.id);

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      list_sort: listSort,
      list_columns: listColumns,
      default_tag_ids: defaultTagIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return error ? FAILED : ok;
}

export async function createFieldAction(input: {
  name: string;
  type: string;
  options: string[];
}): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const { data: existing } = await supabase.from("custom_fields").select("name");
  if ((existing?.length ?? 0) >= FIELD_MAX_COUNT) return fail(`項目は${FIELD_MAX_COUNT}個までです`);

  const r = validateFieldDefinition(
    input,
    (existing ?? []).map((f) => f.name),
  );
  if (!r.ok) return fail(r.error);
  const { error } = await supabase.from("custom_fields").insert({
    user_id: userId,
    name: r.value.name,
    field_type: r.value.type,
    options: r.value.options,
    sort_order: existing?.length ?? 0,
  });
  return error ? (error.code === "23505" ? fail("同じ名前の項目があります") : FAILED) : ok;
}

/** 項目の編集。種類は変えられない（保存済みの値が合わなくなるため）。選択肢を減らしても、入力済みの値は残る */
export async function updateFieldAction(input: {
  id: string;
  name: string;
  options?: string[];
  showInList: boolean;
  hidden: boolean;
}): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(input?.id)) return fail("項目が見つかりません");
  const { data: all } = await supabase.from("custom_fields").select("id, name, field_type");
  const cur = all?.find((f) => f.id === input.id);
  if (!cur) return fail("項目が見つかりません");

  const r = validateFieldDefinition(
    { name: input.name, type: cur.field_type, options: input.options },
    (all ?? []).filter((f) => f.id !== input.id).map((f) => f.name),
  );
  if (!r.ok) return fail(r.error);

  const { error } = await supabase
    .from("custom_fields")
    .update({
      name: r.value.name,
      ...(r.value.options ? { options: r.value.options } : {}),
      show_in_list: input.showInList === true,
      hidden: input.hidden === true,
    })
    .eq("id", input.id);
  return error ? (error.code === "23505" ? fail("同じ名前の項目があります") : FAILED) : ok;
}

export async function deleteFieldAction(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(id)) return fail("項目が見つかりません");
  // 各曲の値は外部キーの cascade で一緒に消える
  const { error } = await supabase.from("custom_fields").delete().eq("id", id);
  return error ? fail("削除できませんでした。") : ok;
}

export async function reorderFieldsAction(ids: string[]): Promise<Result> {
  const { supabase } = await requireUser();
  if (!Array.isArray(ids) || !ids.every(isId)) return fail("並べ替えできませんでした");
  const { error } = await supabase.rpc("reorder_custom_fields", { p_ids: ids });
  return error ? FAILED : ok;
}

/**
 * アカウントの削除。DB関数 delete_my_account（呼び出したユーザー自身の行だけを消す）を使う。
 * サービスロールキーは使わない。全データは外部キーの cascade で消える。
 */
export async function deleteAccountAction(confirmation: string): Promise<Result> {
  if (confirmation !== "削除") return fail("確認のため「削除」と入力してください");
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return fail("削除できませんでした。時間をおいてもう一度お試しください。");
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ユーザーは既に存在しない。Cookie が残っても次のリクエストで無効になる
  }
  redirect("/login?deleted=1");
}
