"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { SongPanel } from "@/components/SongPanel";
import { signOut } from "@/app/login/actions";
import { formatKey } from "@/lib/songs/key";
import type { SongRow, TagWithCount } from "@/lib/songs/queries";
import { SORT_KEYS, SORT_LABELS, type SortKey } from "@/lib/songs/sort";
import type { GroupOption } from "@/lib/tags/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import styles from "./home.module.css";

type Props = {
  songs: SongRow[];
  /** 絞り込み前の全曲数（0 なら「まだ曲がありません」） */
  total: number;
  sort: SortKey;
  defaultSort: SortKey;
  tagId: string | null;
  tags: TagWithCount[];
  groups: GroupOption[];
  today: string;
};

const CHIP_LIMIT = 8;
const WIDE = "(min-width: 900px)";

function href(sort: SortKey, defaultSort: SortKey, tagId: string | null) {
  const q = new URLSearchParams();
  if (sort !== defaultSort) q.set("sort", sort);
  if (tagId) q.set("tag", tagId);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

export function SetList({ songs, total, sort, defaultSort, tagId, tags, groups, today }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wide = useMediaQuery(WIDE);
  const selected = songs.find((s) => s.id === selectedId) ?? songs[0];

  const chips = [...tags]
    .filter((t) => t.count > 0 || t.id === tagId)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"))
    .slice(0, CHIP_LIMIT);
  // 選択中のタグが上位に入らなくても、チップに出して解除できるようにする
  if (tagId && !chips.some((c) => c.id === tagId)) {
    const cur = tags.find((t) => t.id === tagId);
    if (cur) chips.push(cur);
  }

  const onRowClick = useCallback((e: React.MouseEvent, id: string) => {
    // PC では遷移せず、右の詳細パネルに出す。修飾キー付きは通常のリンク動作
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (window.matchMedia(WIDE).matches) {
      e.preventDefault();
      setSelectedId(id);
    }
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="5" y="3" width="14" height="18" rx="1.5" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
          <h1>Setlistic</h1>
        </div>
        <h1 className={styles.pcTitle}>
          セトリ <span>{songs.length}曲</span>
        </h1>

        <div className={styles.headerActions}>
          <details className={styles.sort} key={sort}>
            <summary aria-label={`並び替え（現在：${SORT_LABELS[sort]}）`}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />
              </svg>
              <span className={styles.sortLabel}>{SORT_LABELS[sort]}</span>
            </summary>
            <ul>
              {SORT_KEYS.map((k) => (
                <li key={k}>
                  <Link
                    href={href(k, defaultSort, tagId)}
                    aria-current={k === sort ? "true" : undefined}
                  >
                    {SORT_LABELS[k]}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
          <form action={signOut} className={styles.mobileLogout}>
            <button type="submit">ログアウト</button>
          </form>
        </div>
      </header>

      {total > 0 && (
        <nav className={styles.chips} aria-label="タグで絞り込み">
          <Link
            href={href(sort, defaultSort, null)}
            className={styles.chip}
            aria-current={tagId ? undefined : "true"}
          >
            すべて
          </Link>
          {chips.map((t) => (
            <Link
              key={t.id}
              href={href(sort, defaultSort, tagId === t.id ? null : t.id)}
              className={styles.chip}
              aria-current={tagId === t.id ? "true" : undefined}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      )}

      <div className={styles.main}>
        <section className={styles.card} aria-labelledby="setlist-h">
          <div className={styles.cardHead}>
            <h2 id="setlist-h">SET LIST</h2>
            <span>
              {songs.length}曲 ・ {SORT_LABELS[sort]}
            </span>
          </div>

          {total === 0 ? (
            <div className={styles.empty}>
              <p>まだ曲がありません。</p>
              <p>Apple Music の曲のURLを貼り付けて、最初の1曲を登録しましょう。</p>
              <Link href="/add" className={styles.cta}>
                ＋ 曲を登録
              </Link>
            </div>
          ) : songs.length === 0 ? (
            <div className={styles.empty}>
              <p>該当する曲がありません。</p>
              <Link href={href(sort, defaultSort, null)}>絞り込みを解除</Link>
            </div>
          ) : (
            <ol className={styles.list}>
              {songs.map((s) => {
                return (
                  <li key={s.id}>
                    <Link
                      href={`/songs/${s.id}`}
                      className={styles.row}
                      data-selected={s.id === selected?.id ? "" : undefined}
                      aria-current={s.id === selected?.id ? "true" : undefined}
                      onClick={(e) => onRowClick(e, s.id)}
                    >
                      <span className={styles.songMain}>
                        <span className={styles.songTitle}>{s.title}</span>
                        <span className={styles.songArtist}>{s.artist}</span>
                      </span>
                      <span className={styles.songTags}>
                        {s.tags.map((t) => (
                          <span key={t.id} className={styles.tag}>
                            #{t.name}
                          </span>
                        ))}
                      </span>
                      {s.songKey !== null && (
                        <span className={styles.key}>キー {formatKey(s.songKey)}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className={styles.panel} aria-label="選択中の曲">
          {!wide ? null : selected ? (
            <SongPanel
              song={selected}
              groups={groups}
              allTags={tags.map(({ id, name, groupId }) => ({ id, name, groupId }))}
              today={today}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <p className={styles.panelEmpty}>曲を選ぶと、ここに詳細が表示されます。</p>
          )}
        </aside>
      </div>

      <nav className={styles.tabbar} aria-label="メインメニュー">
        <Link href="/" aria-current="page">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="5" y="3" width="14" height="18" rx="1.5" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
          セトリ
        </Link>
        <Link href="/add" className={styles.fab} aria-label="曲を登録">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </nav>
    </div>
  );
}
