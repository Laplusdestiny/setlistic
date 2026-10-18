"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SongDetail } from "@/components/SongDetail";
import type { CustomField } from "@/lib/custom-fields";
import type { SingState, SongRow } from "@/lib/songs/queries";
import type { GroupOption, TagOption } from "@/lib/tags/types";
import styles from "./song-page.module.css";

type Props = {
  song: SongRow;
  sing: SingState;
  today: string;
  allTags: TagOption[];
  groups: GroupOption[];
  fields: CustomField[];
  /** 編集フォームを開いた状態で始める */
  editing?: boolean;
};

/** スマホ向けの曲詳細ページ。PC では一覧の右パネルで同じ表示をする */
export function SongPageView({
  song,
  sing,
  today,
  allTags,
  groups,
  fields,
  editing = false,
}: Props) {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="戻る">
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
          groups={groups}
          allTags={allTags}
          fields={fields}
          initialSing={sing}
          today={today}
          onDeleted={() => router.replace("/")}
          initialEditing={editing}
        />
      </div>
    </div>
  );
}
