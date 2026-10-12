"use server";

import { validateAlias, validateGroupName, validateRename } from "@/lib/tags/manage";
import {
  MAX_TAG_LENGTH,
  normalizeTagName,
  tagNameFromInput,
  validateTagName,
} from "@/lib/tags/normalize";
import { UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";

type Result = { status: "ok" } | { status: "error"; message: string };
const ok: Result = { status: "ok" };
const fail = (message: string): Result => ({ status: "error", message });
const FAILED = fail("保存できませんでした。もう一度お試しください。");
const UNIQUE = "23505";
const NOT_FOUND = "P0002";

const isId = (v: unknown): v is string => typeof v === "string" && UUID_PATTERN.test(v);

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function loadTags(supabase: Client) {
  const { data } = await supabase.from("tags").select("id, name");
  return data ?? [];
}

export async function createTagAction(input: {
  name: string;
  groupId: string | null;
}): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const problem = validateTagName(input?.name ?? "");
  if (problem === "empty") return fail("タグ名を入力してください");
  if (problem === "too_long") return fail(`タグ名は${MAX_TAG_LENGTH}文字までです`);
  const groupId = input.groupId && isId(input.groupId) ? input.groupId : null;

  const name = tagNameFromInput(input.name);
  const normalized = normalizeTagName(name);
  const tags = await loadTags(supabase);
  if (tags.some((t) => normalizeTagName(t.name) === normalized))
    return fail("同じ名前のタグがあります");

  const { error } = await supabase.from("tags").insert({
    user_id: userId,
    group_id: groupId,
    name,
    normalized_name: normalized,
    sort_order: tags.length,
  });
  return error ? (error.code === UNIQUE ? fail("同じ名前のタグがあります") : FAILED) : ok;
}

export async function renameTagAction(input: { id: string; name: string }): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(input?.id)) return fail("タグが見つかりません");
  const r = validateRename(input.name, input.id, await loadTags(supabase));
  if (!r.ok) return fail(r.error);
  const { error } = await supabase
    .from("tags")
    .update({ name: r.value.name, normalized_name: r.value.normalized })
    .eq("id", input.id);
  return error ? (error.code === UNIQUE ? fail("同じ名前のタグがあります") : FAILED) : ok;
}

/** タグを移動先グループの末尾に置く */
async function moveTag(supabase: Client, id: string, groupId: string | null) {
  const { count } = await supabase
    .from("tags")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId ?? "00000000-0000-0000-0000-000000000000");
  const { error } = await supabase
    .from("tags")
    .update({ group_id: groupId, sort_order: count ?? 0 })
    .eq("id", id);
  return error;
}

export async function moveTagAction(input: {
  id: string;
  groupId: string | null;
}): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(input?.id) || (input.groupId !== null && !isId(input.groupId)))
    return fail("タグが見つかりません");
  return (await moveTag(supabase, input.id, input.groupId)) ? FAILED : ok;
}

export async function addAliasAction(input: { tagId: string; alias: string }): Promise<Result> {
  const { supabase, userId } = await requireUser();
  if (!isId(input?.tagId)) return fail("タグが見つかりません");
  const tags = await loadTags(supabase);
  const tag = tags.find((t) => t.id === input.tagId);
  if (!tag) return fail("タグが見つかりません");
  const { data: aliases } = await supabase
    .from("tag_aliases")
    .select("alias")
    .eq("tag_id", input.tagId);

  const r = validateAlias(
    input.alias,
    tag,
    tags,
    (aliases ?? []).map((a) => a.alias),
  );
  if (!r.ok) return fail(r.error);
  const { error } = await supabase.from("tag_aliases").insert({
    tag_id: input.tagId,
    user_id: userId,
    alias: r.value.alias,
    normalized_alias: r.value.normalized,
  });
  return error ? (error.code === UNIQUE ? fail("すでに登録されています") : FAILED) : ok;
}

export async function removeAliasAction(input: { tagId: string; alias: string }): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(input?.tagId) || typeof input.alias !== "string") return fail("別名が見つかりません");
  const { error } = await supabase
    .from("tag_aliases")
    .delete()
    .eq("tag_id", input.tagId)
    .eq("normalized_alias", normalizeTagName(input.alias));
  return error ? FAILED : ok;
}

export async function mergeTagsAction(input: {
  sourceId: string;
  targetId: string;
}): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(input?.sourceId) || !isId(input?.targetId)) return fail("タグが見つかりません");
  const { error } = await supabase.rpc("merge_tags", {
    p_source: input.sourceId,
    p_target: input.targetId,
  });
  if (error) return error.code === NOT_FOUND ? fail("タグが見つかりません") : FAILED;
  return ok;
}

export async function deleteTagAction(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(id)) return fail("タグが見つかりません");
  const { error } = await supabase.rpc("delete_tag", { p_id: id });
  if (error)
    return error.code === NOT_FOUND ? fail("タグが見つかりません") : fail("削除できませんでした。");
  return ok;
}

export async function reorderTagsAction(ids: string[]): Promise<Result> {
  const { supabase } = await requireUser();
  if (!Array.isArray(ids) || !ids.every(isId)) return fail("並べ替えできませんでした");
  const { error } = await supabase.rpc("reorder_tags", { p_ids: ids });
  return error ? FAILED : ok;
}

// ───────── グループ ─────────

/** グループの新規作成。tagId を渡すと、そのタグを作ったグループへ移す */
export async function createGroupAction(input: { name: string; tagId?: string }): Promise<Result> {
  const { supabase, userId } = await requireUser();
  if (input?.tagId !== undefined && !isId(input.tagId)) return fail("タグが見つかりません");
  const { data } = await supabase.from("tag_groups").select("id, name");
  const r = validateGroupName(String(input?.name ?? ""), data ?? []);
  if (!r.ok) return fail(r.error);
  const { data: created, error } = await supabase
    .from("tag_groups")
    .insert({ user_id: userId, name: r.value, sort_order: data?.length ?? 0 })
    .select("id")
    .single();
  if (error || !created)
    return error?.code === UNIQUE ? fail("同じ名前のグループがあります") : FAILED;
  if (input.tagId && (await moveTag(supabase, input.tagId, created.id)))
    return fail("グループは作りましたが、タグを移せませんでした");
  return ok;
}

export async function renameGroupAction(input: { id: string; name: string }): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(input?.id)) return fail("グループが見つかりません");
  const { data } = await supabase.from("tag_groups").select("id, name");
  const r = validateGroupName(String(input.name ?? ""), data ?? [], input.id);
  if (!r.ok) return fail(r.error);
  const { error } = await supabase.from("tag_groups").update({ name: r.value }).eq("id", input.id);
  return error ? (error.code === UNIQUE ? fail("同じ名前のグループがあります") : FAILED) : ok;
}

/** グループの削除。中のタグは消えず、「マイタグ」（グループなし）になる */
export async function deleteGroupAction(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  if (!isId(id)) return fail("グループが見つかりません");
  const { error } = await supabase.from("tag_groups").delete().eq("id", id);
  return error ? fail("削除できませんでした。") : ok;
}

export async function reorderGroupsAction(ids: string[]): Promise<Result> {
  const { supabase } = await requireUser();
  if (!Array.isArray(ids) || !ids.every(isId)) return fail("並べ替えできませんでした");
  const { error } = await supabase.rpc("reorder_tag_groups", { p_ids: ids });
  return error ? FAILED : ok;
}
