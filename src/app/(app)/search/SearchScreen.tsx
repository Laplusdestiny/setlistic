"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConditionsForm } from "@/components/ConditionsForm";
import { SaveSearchForm } from "@/components/SaveSearchForm";
import { SavedSearchList } from "@/components/SavedSearchList";
import {
  conditionsToHref,
  countConditions,
  EMPTY_CONDITIONS,
  hasConditions,
  type SearchConditions,
} from "@/lib/search/conditions";
import { suggestSearchName, type SavedSearch } from "@/lib/search/saved";
import type { GroupOption, TagOption } from "@/lib/tags/types";
import { deleteSavedSearchAction } from "./actions";
import styles from "./search.module.css";

type Props = {
  initial: SearchConditions;
  tags: TagOption[];
  groups: GroupOption[];
  saved: SavedSearch[];
};

/** スマホの絞り込み検索画面（PC ではホームの左パネルを使う）。結果はホーム（/）に表示する */
export function SearchScreen({ initial, tags, groups, saved }: Props) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [pending, start] = useTransition();
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name;
  const n = countConditions(c);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          aria-label="戻る"
          onClick={() => router.back()}
        >
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
        </button>
        <h1>絞り込み検索</h1>
        <button
          type="button"
          className={styles.reset}
          onClick={() => setC({ ...EMPTY_CONDITIONS, sort: c.sort })}
        >
          リセット
        </button>
      </header>

      <div className={styles.body}>
        <SavedSearchList
          saved={saved}
          tagName={tagName}
          disabled={pending}
          onApply={(s) => setC(s.conditions)}
          onDelete={(s) =>
            start(async () => {
              await deleteSavedSearchAction(s.id);
              router.refresh();
            })
          }
        />

        <ConditionsForm
          conditions={c}
          onChange={setC}
          groups={groups}
          tags={tags}
          showKeyword
          showSort
          advancedOpen={
            c.artist !== "" ||
            c.genre !== "" ||
            c.decades.length + c.durations.length + c.keys.length > 0 ||
            c.lastEase !== null
          }
        />

        {hasConditions(c) && (
          <SaveSearchForm conditions={c} suggestedName={suggestSearchName(c, tagName)} />
        )}
      </div>

      <div className={styles.footer}>
        <Link href={conditionsToHref(c)} className={styles.cta}>
          {n > 0 ? `${n}個の条件で絞り込む` : "すべての曲を表示"}
        </Link>
      </div>
    </div>
  );
}
