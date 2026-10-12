"use server";

import { sanitizeFieldValues } from "@/lib/custom-fields";
import { todayJst } from "@/lib/format";
import { getSingState, listCustomFields, type SingState } from "@/lib/songs/queries";
import { toSingLogPayload } from "@/lib/songs/sing-log";
import { toUpdatePayload, UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";

type Fail = { status: "error"; message: string };
const FAIL: Fail = { status: "error", message: "保存できませんでした。もう一度お試しください。" };

export async function updateSongAction(raw: unknown): Promise<{ status: "ok" } | Fail> {
  const { supabase } = await requireUser();
  const payload = toUpdatePayload(raw);
  if (!payload.ok) return { status: "error", message: payload.error };

  const defs = await listCustomFields(supabase);
  const fields = sanitizeFieldValues(defs, (raw as { fields?: unknown }).fields);

  const { error } = await supabase.rpc("update_song", {
    p_id: payload.value.id,
    p_song: payload.value.song,
    p_tag_ids: payload.value.tagIds,
    p_new_tags: payload.value.newTags,
    p_fields: fields,
  });
  if (error) {
    return error.code === "P0002" ? { status: "error", message: "曲が見つかりません。" } : FAIL;
  }
  return { status: "ok" };
}

export async function deleteSongAction(id: string): Promise<{ status: "ok" } | Fail> {
  const { supabase } = await requireUser();
  if (typeof id !== "string" || !UUID_PATTERN.test(id))
    return { status: "error", message: "曲が見つかりません。" };
  // 歌唱記録・タグの紐づけは外部キーの cascade で一緒に消える
  const { error } = await supabase.from("songs").delete().eq("id", id);
  return error
    ? { status: "error", message: "削除できませんでした。もう一度お試しください。" }
    : { status: "ok" };
}

export async function loadSingStateAction(songId: string): Promise<SingState | null> {
  const { supabase } = await requireUser();
  if (typeof songId !== "string" || !UUID_PATTERN.test(songId)) return null;
  return getSingState(supabase, songId);
}

export async function recordSingAction(
  raw: unknown,
): Promise<{ status: "ok"; state: SingState } | Fail> {
  const { supabase, userId } = await requireUser();
  const payload = toSingLogPayload(raw, todayJst());
  if (!payload.ok) return { status: "error", message: payload.error };

  const { error } = await supabase.from("sing_logs").insert({
    user_id: userId,
    song_id: payload.value.songId,
    sung_at: payload.value.sungAt,
    ease: payload.value.ease,
    note: payload.value.note,
  });
  if (error) return FAIL;
  // last_sung_at / sung_count は DB のトリガーが更新する
  return { status: "ok", state: await getSingState(supabase, payload.value.songId) };
}

export async function deleteSingLogAction(
  songId: string,
  logId: string,
): Promise<{ status: "ok"; state: SingState } | Fail> {
  const { supabase } = await requireUser();
  if (![songId, logId].every((v) => typeof v === "string" && UUID_PATTERN.test(v)))
    return { status: "error", message: "記録が見つかりません。" };
  const { error } = await supabase.from("sing_logs").delete().eq("id", logId).eq("song_id", songId);
  if (error) return { status: "error", message: "削除できませんでした。もう一度お試しください。" };
  return { status: "ok", state: await getSingState(supabase, songId) };
}
