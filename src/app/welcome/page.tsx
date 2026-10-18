import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSong } from "@/lib/songs/queries";
import { UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";
import { parseTutorialStep, tutorialHref } from "@/lib/tutorial";
import { Tutorial } from "./Tutorial";
import styles from "./tutorial.module.css";

export const metadata: Metadata = { title: "はじめに" };

type Search = Promise<{ step?: string | string[]; song?: string | string[] }>;

// 初回のチュートリアル（Issue #18）。手順は ?step= で持ち、ブラウザバックで前の手順に戻れる。
// 設定の「チュートリアルをもう一度見る」からも開く（完了の記録は変えない）
export default function WelcomePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className={styles.screen} aria-busy="true" />}>
      <WelcomeLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function WelcomeLoader({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const step = parseTutorialStep(typeof sp.step === "string" ? sp.step : null);
  const { supabase } = await requireUser();

  if (step !== "done") return <Tutorial step={step} song={null} />;

  // 完了画面は、登録した曲を表示する。曲が無い（URL を直接開いた・削除した）ときは登録の手順へ
  const id = typeof sp.song === "string" ? sp.song : "";
  const song = UUID_PATTERN.test(id) ? await getSong(supabase, id) : null;
  if (!song) redirect(tutorialHref("register"));
  return <Tutorial step="done" song={{ id: song.id, title: song.title, artist: song.artist }} />;
}
