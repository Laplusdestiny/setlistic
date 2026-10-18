"use server";

import { lookupFromUrl, saveSongAction } from "@/app/(app)/add/actions";
import { lookupErrorMessage } from "@/app/(app)/add/messages";
import type { Candidate } from "@/app/(app)/add/types";
import { getUserSettings } from "@/lib/songs/queries";
import { requireUser } from "@/lib/supabase/user";

export type FirstSongResult = { status: "ok"; id: string } | { status: "error"; message: string };

/**
 * チュートリアルを終えた（スキップ・あとで登録する・完了画面に到達）ことを記録する。
 * 記録は最初の1回だけ。設定から見返したときは、すでに入っている日時を変えない
 */
export async function completeTutorialAction(): Promise<void> {
  const { supabase, userId } = await requireUser();
  await supabase
    .from("user_settings")
    .update({ tutorial_completed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("tutorial_completed_at", null);
}

/**
 * チュートリアルの「1曲登録してみる」。曲の登録画面と同じ処理（URL から取得 → 登録）を使い、
 * 確認画面を挟まずにそのまま登録する。登録できたらチュートリアルを完了にする
 */
export async function registerFirstSongAction(url: string): Promise<FirstSongResult> {
  const looked = await lookupFromUrl(url);
  if (looked.status === "error") {
    return { status: "error", message: lookupErrorMessage(looked.reason, looked.service) };
  }

  // Spotify / YouTube Music で Apple Music の曲と確信できないときは、違う曲を登録しないよう取得元の表記で登録する
  const ext = looked.external;
  const chosen: Candidate =
    ext && ext.confidence !== "confident"
      ? ext.source
      : { draft: looked.draft, duplicate: looked.duplicate };
  if (chosen.duplicate) {
    return {
      status: "error",
      message: `「${chosen.duplicate.title}」はすでに登録されています。別の曲のリンクを貼り付けてください。`,
    };
  }

  const { supabase, userId } = await requireUser();
  const { defaultTagIds } = await getUserSettings(supabase, userId);
  const saved = await saveSongAction({
    draft: chosen.draft,
    songKey: 0,
    memo: "",
    tagIds: defaultTagIds,
    newTags: [],
  });
  switch (saved.status) {
    case "ok":
      await completeTutorialAction();
      return { status: "ok", id: saved.id };
    case "duplicate":
      return {
        status: "error",
        message: "この曲はすでに登録されています。別の曲のリンクを貼り付けてください。",
      };
    case "limit":
      return { status: "error", message: "登録できる曲数の上限に達しています。" };
    default:
      return { status: "error", message: saved.message };
  }
}
