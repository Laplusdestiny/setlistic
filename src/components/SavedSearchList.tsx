"use client";

import { describeConditions } from "@/lib/search/conditions";
import type { SavedSearch } from "@/lib/search/saved";
import form from "./form.module.css";
import styles from "./saved-search.module.css";

type Props = {
  saved: SavedSearch[];
  tagName: (id: string) => string | undefined;
  onApply: (s: SavedSearch) => void;
  /** 渡したときだけ「削除」を出す（管理できる画面用） */
  onDelete?: (s: SavedSearch) => void;
  disabled?: boolean;
};

export function SavedSearchList({ saved, tagName, onApply, onDelete, disabled }: Props) {
  if (saved.length === 0) return null;
  return (
    <section className={styles.root} aria-label="保存した条件">
      <h2 className={form.sectionTitle}>保存した条件</h2>
      <ul>
        {saved.map((s) => {
          const summary = describeConditions(s.conditions, tagName).join(" ／ ");
          return (
            <li key={s.id}>
              <button
                type="button"
                className={styles.apply}
                disabled={disabled}
                onClick={() => onApply(s)}
              >
                <strong>{s.name}</strong>
                {summary && <span>{summary}</span>}
              </button>
              {onDelete && (
                <button
                  type="button"
                  className={styles.delete}
                  disabled={disabled}
                  aria-label={`「${s.name}」を削除`}
                  onClick={() => onDelete(s)}
                >
                  削除
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
