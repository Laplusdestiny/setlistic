"use server";

import { toBulkTagPayload } from "@/lib/songs/bulk-tags";
import { requireUser } from "@/lib/supabase/user";

export async function bulkEditTagsAction(
  raw: unknown,
): Promise<{ status: "ok"; count: number } | { status: "error"; message: string }> {
  const { supabase } = await requireUser();
  const payload = toBulkTagPayload(raw);
  if (!payload.ok) return { status: "error", message: payload.error };

  const { data, error } = await supabase.rpc("bulk_edit_song_tags", {
    p_song_ids: payload.value.songIds,
    p_add_tag_ids: payload.value.addTagIds,
    p_new_tags: payload.value.newTags,
    p_remove_tag_ids: payload.value.removeTagIds,
    p_set_priority: payload.value.priority.set,
    p_priority: payload.value.priority.set ? payload.value.priority.value : null,
  });
  if (error) {
    if (error.code === "P0002")
      return {
        status: "error",
        message: "選んだ曲の一部が見つかりませんでした。画面を開き直してください。",
      };
    return { status: "error", message: "変更できませんでした。もう一度お試しください。" };
  }
  return { status: "ok", count: typeof data === "number" ? data : payload.value.songIds.length };
}
