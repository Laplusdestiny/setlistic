"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { SongDetail } from "@/components/SongDetail";
import type { CustomField } from "@/lib/custom-fields";
import type { SingState, SongRow } from "@/lib/songs/queries";
import { songReturnHref } from "@/lib/songs/return-to";
import type { GroupOption, TagOption } from "@/lib/tags/types";
import styles from "./song-page.module.css";

type Props = {
  song: SongRow;
  /** ジャケット画像の URL（無い曲は null） */
  artworkUrl?: string | null;
  sing: SingState;
  today: string;
  allTags: TagOption[];
  groups: GroupOption[];
  fields: CustomField[];
  /** 編集フォームを開いた状態で始める */
  editing?: boolean;
};

const noSubscribe = () => () => {};

/** スマホ向けの曲詳細ページ。PC では一覧の右パネルで同じ表示をする */
export function SongPageView({
  song,
  artworkUrl = null,
  sing,
  today,
  allTags,
  groups,
  fields,
  editing = false,
}: Props) {
  const router = useRouter();
  // セトリ（検索・絞り込みの結果）から開いた曲なら、その一覧へ戻る。sessionStorage はサーバーで読めないので、描画後に読む
  const returnHref = useSyncExternalStore(
    noSubscribe,
    () => songReturnHref(song.id),
    () => null,
  );

  function onBack(e: React.MouseEvent) {
    // 一覧から来たときはブラウザの「戻る」と同じにして、スクロール位置も戻す。
    // 履歴が無いとき（ホーム画面から開き直したときなど）はリンクのまま一覧の URL へ移る
    if (!returnHref || e.metaKey || e.ctrlKey || e.shiftKey || window.history.length <= 1) return;
    e.preventDefault();
    router.back();
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={returnHref ?? "/"} className={styles.back} aria-label="戻る" onClick={onBack}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      </header>
      <div className={styles.body}>
        <SongDetail
          key={song.id}
          song={song}
          artworkUrl={artworkUrl}
          groups={groups}
          allTags={allTags}
          fields={fields}
          initialSing={sing}
          today={today}
          onDeleted={() => router.replace(returnHref ?? "/")}
          initialEditing={editing}
        />
      </div>
    </div>
  );
}
