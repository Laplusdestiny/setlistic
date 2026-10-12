"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { signOut } from "@/app/login/actions";
import { formatFieldValue, visibleFields, type CustomField } from "@/lib/custom-fields";
import { ConditionsForm } from "@/components/ConditionsForm";
import { SaveSearchForm } from "@/components/SaveSearchForm";
import { SavedSearchList } from "@/components/SavedSearchList";
import { SongPanel } from "@/components/SongPanel";
import {
  conditionsToHref,
  describeConditions,
  EMPTY_CONDITIONS,
  hasConditions,
  pickRandom,
  type SearchConditions,
} from "@/lib/search/conditions";
import { suggestSearchName, type SavedSearch } from "@/lib/search/saved";
import { formatKey } from "@/lib/songs/key";
import type { SongRow, TagWithCount } from "@/lib/songs/queries";
import { SORT_KEYS, SORT_LABELS } from "@/lib/songs/sort";
import type { SortKey } from "@/lib/songs/sort";
import type { GroupOption } from "@/lib/tags/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { deleteSavedSearchAction } from "./search/actions";
import styles from "./home.module.css";

type Props = {
  songs: SongRow[];
  /** 絞り込み前の全曲数（0 なら「まだ曲がありません」） */
  total: number;
  conditions: SearchConditions;
  defaultSort: SortKey;
  tags: TagWithCount[];
  groups: GroupOption[];
  saved: SavedSearch[];
  /** カスタム項目の定義 */
  fields: CustomField[];
  /** 一覧に出す基本項目（"key" / "tags"） */
  listColumns: string[];
  today: string;
};

const CHIP_LIMIT = 8;
const WIDE = "(min-width: 900px)";
const FILTER_WIDE = "(min-width: 1180px)";
const DEBOUNCE_MS = 300;

const isTextChange = (a: SearchConditions, b: SearchConditions) =>
  a.q !== b.q || a.artist !== b.artist || a.genre !== b.genre;

export function SetList({
  songs,
  total,
  conditions,
  defaultSort,
  tags,
  groups,
  saved,
  fields,
  listColumns,
  today,
}: Props) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const [, startDelete] = useTransition();
  const wide = useMediaQuery(WIDE);
  const filterWide = useMediaQuery(FILTER_WIDE);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = songs.find((s) => s.id === selectedId) ?? songs[0];

  // 入力欄の状態（draft）。URL（サーバーの条件）への反映は少し遅らせる。
  // 戻るボタンや保存した条件の呼び出しなど、こちら以外が URL を変えたときは draft を合わせる。
  const propHref = conditionsToHref(conditions);
  const [draft, setDraft] = useState(conditions);
  const [applied, setApplied] = useState(propHref);
  const [seen, setSeen] = useState(propHref);
  if (propHref !== seen) {
    setSeen(propHref);
    if (propHref !== applied) {
      setDraft(conditions);
      setApplied(propHref);
    }
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apply = useCallback(
    (next: SearchConditions, prev: SearchConditions) => {
      setDraft(next);
      const href = conditionsToHref(next);
      setApplied(href);
      if (timer.current) clearTimeout(timer.current);
      const go = () => startNav(() => router.replace(href, { scroll: false }));
      if (isTextChange(prev, next)) timer.current = setTimeout(go, DEBOUNCE_MS);
      else go();
    },
    [router],
  );
  const change = (next: SearchConditions) => apply(next, draft);

  const sort = conditions.sort ?? defaultSort;
  const showKey = listColumns.includes("key");
  const showTags = listColumns.includes("tags");
  const listFields = visibleFields(fields).filter((f) => f.showInList);
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name;
  const active = hasConditions(conditions);
  const sortMenu = useRef<HTMLDetailsElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // 「/」で検索欄にフォーカス（PC）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chips = [...tags]
    .filter((t) => t.count > 0 || conditions.include.includes(t.id))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"))
    .slice(0, CHIP_LIMIT);
  for (const id of conditions.include) {
    const cur = tags.find((t) => t.id === id);
    if (cur && !chips.some((c) => c.id === id)) chips.push(cur);
  }

  const toggleChip = (id: string) =>
    change({
      ...draft,
      include: draft.include.includes(id)
        ? draft.include.filter((x) => x !== id)
        : [...draft.include, id],
      exclude: draft.exclude.filter((x) => x !== id),
    });

  const onRowClick = useCallback((e: React.MouseEvent, id: string) => {
    // PC では遷移せず、右の詳細パネルに出す。修飾キー付きは通常のリンク動作
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (window.matchMedia(WIDE).matches) {
      e.preventDefault();
      setSelectedId(id);
    }
  }, []);

  function random() {
    const s = pickRandom(songs);
    if (!s) return;
    if (wide) {
      setSelectedId(s.id);
      document.getElementById(`song-${s.id}`)?.scrollIntoView({ block: "center" });
    } else router.push(`/songs/${s.id}`);
  }

  const reset = () => change({ ...EMPTY_CONDITIONS, sort: draft.sort });

  const filterPanel = (
    <aside className={styles.filter} aria-label="絞り込み">
      <div className={styles.filterHead}>
        <h2>絞り込み</h2>
        <button type="button" onClick={reset}>
          リセット
        </button>
      </div>
      <SavedSearchList
        saved={saved}
        tagName={tagName}
        onApply={(s) => change(s.conditions)}
        onDelete={(s) =>
          startDelete(async () => {
            await deleteSavedSearchAction(s.id);
            router.refresh();
          })
        }
      />
      <ConditionsForm conditions={draft} onChange={change} groups={groups} tags={tags} />
      {hasConditions(draft) && (
        <SaveSearchForm conditions={draft} suggestedName={suggestSearchName(draft, tagName)} />
      )}
    </aside>
  );

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
          {total > 0 && songs.length > 0 && (
            <button type="button" className={styles.iconButton} onClick={random}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
              <span className={styles.buttonLabel}>ランダム</span>
              <span className="visually-hidden">に1曲選ぶ</span>
            </button>
          )}
          <details className={styles.sort} ref={sortMenu}>
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
              <span className={styles.buttonLabel}>{SORT_LABELS[sort]}</span>
            </summary>
            <ul>
              {SORT_KEYS.map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    aria-current={k === sort ? "true" : undefined}
                    onClick={() => {
                      if (sortMenu.current) sortMenu.current.open = false;
                      change({ ...draft, sort: k === defaultSort ? null : k });
                    }}
                  >
                    {SORT_LABELS[k]}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <form action={signOut} className={styles.mobileLogout}>
            <button type="submit">ログアウト</button>
          </form>
        </div>

        {total > 0 && (
          <div className={styles.searchBox}>
            <label htmlFor="home-q" className="visually-hidden">
              曲を検索
            </label>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              id="home-q"
              ref={searchInput}
              type="search"
              value={draft.q}
              placeholder="曲名・アーティスト・タグ"
              autoComplete="off"
              enterKeyHint="search"
              onChange={(e) => change({ ...draft, q: e.target.value })}
            />
            <Link href={conditionsToHref(draft, "/search")} className={styles.detailLink}>
              絞り込み
            </Link>
          </div>
        )}
      </header>

      {total > 0 && (
        <nav className={styles.chips} aria-label="タグで絞り込み">
          <button
            type="button"
            className={styles.chip}
            aria-pressed={!hasConditions(draft)}
            onClick={reset}
          >
            すべて
          </button>
          {chips.map((t) => (
            <button
              key={t.id}
              type="button"
              className={styles.chip}
              aria-pressed={draft.include.includes(t.id)}
              onClick={() => toggleChip(t.id)}
            >
              {t.name}
            </button>
          ))}
          {saved.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.chip}
              data-saved
              onClick={() => change(s.conditions)}
            >
              ★ {s.name}
            </button>
          ))}
        </nav>
      )}

      {active && (
        <div className={styles.summary} role="status">
          <p>
            <strong>{songs.length}曲</strong>が見つかりました
            <span>{describeConditions(conditions, tagName).join(" ／ ")}</span>
          </p>
          <button type="button" onClick={reset}>
            条件を解除
          </button>
        </div>
      )}

      <div className={styles.main}>
        {filterWide && total > 0 && filterPanel}

        <section
          className={styles.card}
          aria-labelledby="setlist-h"
          aria-busy={navigating}
          data-pending={navigating ? "" : undefined}
        >
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
              <button type="button" className={styles.linkButton} onClick={reset}>
                条件を解除する
              </button>
            </div>
          ) : (
            <ol className={styles.list}>
              {songs.map((s) => (
                <li key={s.id}>
                  <Link
                    id={`song-${s.id}`}
                    href={`/songs/${s.id}`}
                    className={styles.row}
                    data-selected={s.id === selected?.id ? "" : undefined}
                    aria-current={s.id === selected?.id ? "true" : undefined}
                    onClick={(e) => onRowClick(e, s.id)}
                  >
                    <span className={styles.songMain}>
                      <span className={styles.songTitle}>{s.title}</span>
                      <span className={styles.songArtist}>{s.artist}</span>
                      {listFields.length > 0 && (
                        <span className={styles.songFields}>
                          {listFields.map((f) => {
                            const text = formatFieldValue(f, s.fields[f.id]);
                            return text ? (
                              <span key={f.id}>
                                {f.name} {text}
                              </span>
                            ) : null;
                          })}
                        </span>
                      )}
                    </span>
                    <span className={styles.songTags}>
                      {showTags &&
                        s.tags.map((t) => (
                          <span key={t.id} className={styles.tag}>
                            #{t.name}
                          </span>
                        ))}
                    </span>
                    {showKey && s.songKey !== null && (
                      <span className={styles.key}>キー {formatKey(s.songKey)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className={styles.panel} aria-label="選択中の曲">
          {!wide ? null : selected ? (
            <SongPanel
              song={selected}
              groups={groups}
              allTags={tags.map(({ id, name, groupId, aliases }) => ({
                id,
                name,
                groupId,
                aliases,
              }))}
              fields={fields}
              today={today}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <p className={styles.panelEmpty}>曲を選ぶと、ここに詳細が表示されます。</p>
          )}
        </aside>
      </div>

      <nav className={styles.tabbar} aria-label="メインメニュー">
        <div className={styles.tabGroup}>
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
          <Link href={conditionsToHref(draft, "/search")}>
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
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            検索
          </Link>
        </div>
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
        <div className={styles.tabGroup}>
          <Link href="/tags">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12V4h8l10 10-8 8z" />
              <circle cx="7.5" cy="8.5" r="1.3" />
            </svg>
            タグ
          </Link>
          <Link href="/settings">
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
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
            </svg>
            設定
          </Link>
        </div>
      </nav>
    </div>
  );
}
