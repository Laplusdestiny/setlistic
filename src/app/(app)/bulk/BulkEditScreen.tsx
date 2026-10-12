"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { TagPicker } from "@/components/TagPicker";
import { BULK_MAX_SONGS } from "@/lib/songs/bulk-tags";
import { normalizeSearchText } from "@/lib/search/conditions";
import type { GroupOption, NewTag, TagOption } from "@/lib/tags/types";
import { bulkEditTagsAction } from "./actions";
import styles from "./bulk.module.css";

type BulkSong = { id: string; title: string; artist: string; tags: { id: string; name: string }[] };
type Props = {
  songs: BulkSong[];
  tags: (TagOption & { count: number })[];
  groups: GroupOption[];
  preselectedIds: string[];
};

const toggle = <T,>(xs: Set<T>, x: T): Set<T> => {
  const next = new Set(xs);
  if (!next.delete(x)) next.add(x);
  return next;
};

/** 複数の曲に、タグをまとめて付ける・外す画面 */
export function BulkEditScreen({ songs, tags, groups, preselectedIds }: Props) {
  const router = useRouter();
  const id = useId();
  const known = useMemo(() => new Set(songs.map((s) => s.id)), [songs]);
  const [selected, setSelected] = useState(
    () => new Set(preselectedIds.filter((i) => known.has(i))),
  );
  const [q, setQ] = useState("");
  const [untagged, setUntagged] = useState(false);
  const [add, setAdd] = useState<Set<string>>(new Set());
  const [newTags, setNewTags] = useState<NewTag[]>([]);
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const needle = normalizeSearchText(q.trim());
  const visible = songs.filter(
    (s) =>
      (!untagged || s.tags.length === 0) &&
      (!needle ||
        normalizeSearchText(s.title).includes(needle) ||
        normalizeSearchText(s.artist).includes(needle) ||
        s.tags.some((t) => normalizeSearchText(t.name).includes(needle))),
  );
  const visibleIds = visible.map((s) => s.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((i) => selected.has(i));
  const untaggedCount = songs.filter((s) => s.tags.length === 0).length;

  // 選んだ曲に付いているタグ（外す候補）と、その曲数
  const removable = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const s of songs) {
      if (!selected.has(s.id)) continue;
      for (const t of s.tags) counts.set(t.id, { name: t.name, n: (counts.get(t.id)?.n ?? 0) + 1 });
    }
    return [...counts.entries()]
      .map(([tid, v]) => ({ id: tid, ...v }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "ja"));
  }, [songs, selected]);

  const tagName = (tid: string) => tags.find((t) => t.id === tid)?.name ?? "";
  const nothingToDo = add.size + newTags.length + remove.size === 0;
  const tooMany = selected.size > BULK_MAX_SONGS;

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((i) => next.delete(i));
      else visibleIds.forEach((i) => next.add(i));
      return next;
    });
  }

  function apply() {
    setMessage(null);
    start(async () => {
      const res = await bulkEditTagsAction({
        songIds: [...selected],
        addTagIds: [...add],
        newTags,
        removeTagIds: [...remove],
      });
      if (res.status === "ok") {
        setMessage({ kind: "ok", text: `${res.count}曲のタグを変更しました` });
        setAdd(new Set());
        setNewTags([]);
        setRemove(new Set());
        router.refresh();
      } else setMessage({ kind: "error", text: res.message });
    });
  }

  const summary = [
    ...[...add].map((t) => `#${tagName(t)}`),
    ...newTags.map((t) => `#${t.name}（新規）`),
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/tags" className={styles.back} aria-label="戻る">
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
        <h1>タグの一括変更</h1>
      </header>
      <p className={styles.lead}>
        曲を選んで、タグをまとめて付けたり外したりできます。まとめて登録したときの付け忘れの手直しに。
      </p>

      <div className={styles.layout}>
        <section className={styles.songs} aria-labelledby={`${id}-songs`}>
          <h2 id={`${id}-songs`} className="visually-hidden">
            曲を選ぶ
          </h2>
          <div className={styles.filters}>
            <label htmlFor={`${id}-q`} className="visually-hidden">
              曲を絞り込む
            </label>
            <input
              id={`${id}-q`}
              type="search"
              className={styles.search}
              value={q}
              placeholder="曲名・アーティスト・タグ"
              autoComplete="off"
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="button"
              className={styles.chip}
              aria-pressed={untagged}
              onClick={() => setUntagged((v) => !v)}
            >
              タグなしの曲だけ（{untaggedCount}）
            </button>
          </div>

          <div className={styles.listHead}>
            <button
              type="button"
              className={styles.text}
              onClick={selectAllVisible}
              disabled={visible.length === 0}
            >
              {allVisibleSelected
                ? "表示中をすべて解除"
                : `表示中の${visible.length}曲をすべて選ぶ`}
            </button>
            <span aria-live="polite">{selected.size}曲を選択中</span>
            {selected.size > 0 && (
              <button type="button" className={styles.text} onClick={() => setSelected(new Set())}>
                選択を解除
              </button>
            )}
          </div>

          {songs.length === 0 ? (
            <p className={styles.empty}>曲がまだありません。</p>
          ) : visible.length === 0 ? (
            <p className={styles.empty}>該当する曲がありません。</p>
          ) : (
            <ul className={styles.list}>
              {visible.map((s) => (
                <li key={s.id}>
                  <label className={styles.row}>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => setSelected((p) => toggle(p, s.id))}
                    />
                    <span className={styles.rowText}>
                      <strong>{s.title}</strong>
                      <span>{s.artist}</span>
                      <span className={styles.tagLine}>
                        {s.tags.length === 0 ? (
                          <em>タグなし</em>
                        ) : (
                          s.tags.map((t) => `#${t.name}`).join(" ")
                        )}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className={styles.editor} aria-label="タグの変更">
          <TagPicker
            groups={groups}
            tags={tags}
            selectedIds={add}
            newTags={newTags}
            heading="付けるタグ"
            onToggle={(t) => setAdd((p) => toggle(p, t))}
            onSelect={(t) => setAdd((p) => new Set(p).add(t))}
            onAddNew={(t) => setNewTags((p) => [...p, t])}
            onRemoveNew={(name) => setNewTags((p) => p.filter((t) => t.name !== name))}
          />

          <section className={styles.removeBox} aria-labelledby={`${id}-rm`}>
            <h2 id={`${id}-rm`}>外すタグ</h2>
            {selected.size === 0 ? (
              <p className={styles.hint}>曲を選ぶと、その曲に付いているタグが出ます。</p>
            ) : removable.length === 0 ? (
              <p className={styles.hint}>選んだ曲にはタグが付いていません。</p>
            ) : (
              <div className={styles.chips}>
                {removable.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={styles.removeChip}
                    aria-pressed={remove.has(t.id)}
                    disabled={add.has(t.id)}
                    onClick={() => setRemove((p) => toggle(p, t.id))}
                  >
                    #{t.name}
                    <span>{t.n}曲</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {message && (
            <p
              role={message.kind === "error" ? "alert" : "status"}
              className={message.kind === "error" ? styles.error : styles.ok}
            >
              {message.text}
            </p>
          )}

          <div className={styles.apply}>
            {!nothingToDo && selected.size > 0 && (
              <p className={styles.summary}>
                {selected.size}曲に
                {summary.length > 0 && <> {summary.join(" ")} を付け</>}
                {remove.size > 0 && (
                  <>
                    {summary.length > 0 ? "、" : " "}
                    {[...remove]
                      .map((t) => `#${removable.find((r) => r.id === t)?.name ?? tagName(t)}`)
                      .join(" ")}{" "}
                    を外します
                  </>
                )}
                {remove.size === 0 && "ます"}
              </p>
            )}
            {tooMany && (
              <p className={styles.error}>一度に変更できるのは{BULK_MAX_SONGS}曲までです。</p>
            )}
            <button
              type="button"
              className={styles.primary}
              disabled={pending || selected.size === 0 || nothingToDo || tooMany}
              onClick={apply}
            >
              {pending
                ? "変更中…"
                : selected.size === 0
                  ? "曲を選んでください"
                  : `${selected.size}曲に適用`}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
