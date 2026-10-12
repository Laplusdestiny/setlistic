"use client";

import { useId } from "react";
import {
  cycleTag,
  DECADES,
  DURATION_BUCKETS,
  DURATION_LABELS,
  KEY_BUCKETS,
  KEY_LABELS,
  LAST_EASE_LABELS,
  LAST_EASES,
  tagState,
  type SearchConditions,
} from "@/lib/search/conditions";
import { SORT_KEYS, SORT_LABELS } from "@/lib/songs/sort";
import type { GroupOption, TagOption } from "@/lib/tags/types";
import form from "./form.module.css";
import styles from "./conditions.module.css";

type Props = {
  conditions: SearchConditions;
  onChange: (next: SearchConditions) => void;
  groups: GroupOption[];
  tags: TagOption[];
  /** キーワード欄を出す（PC ではヘッダーの検索欄を使うので false） */
  showKeyword?: boolean;
  showSort?: boolean;
  /** 「詳しい条件」を最初から開く */
  advancedOpen?: boolean;
};

const toggle = <T,>(xs: T[], x: T): T[] =>
  xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];

/** 絞り込み条件の入力フォーム（スマホの検索画面と PC の絞り込みパネルで共通） */
export function ConditionsForm({
  conditions: c,
  onChange,
  groups,
  tags,
  showKeyword = false,
  showSort = false,
  advancedOpen = false,
}: Props) {
  const id = useId();
  const set = (patch: Partial<SearchConditions>) => onChange({ ...c, ...patch });

  const byGroup = groups
    .map((g) => ({ name: g.name, tags: tags.filter((t) => t.groupId === g.id) }))
    .filter((g) => g.tags.length > 0);
  const ungrouped = tags.filter((t) => !t.groupId || !groups.some((g) => g.id === t.groupId));
  if (ungrouped.length > 0) byGroup.push({ name: "マイタグ", tags: ungrouped });

  const chip = (t: TagOption) => {
    const state = tagState(c, t.id);
    const label = state === "include" ? "含める" : state === "exclude" ? "除外" : "選んでいない";
    return (
      <button
        key={t.id}
        type="button"
        className={styles.tagChip}
        data-state={state}
        aria-pressed={state !== "none"}
        aria-label={`#${t.name}（${label}）`}
        onClick={() => onChange(cycleTag(c, t.id))}
      >
        {state === "exclude" ? "−" : ""}#{t.name}
      </button>
    );
  };

  const multi = <T extends string | number>(
    legend: string,
    all: readonly T[],
    selected: T[],
    label: (v: T) => string,
    key: "decades" | "durations" | "keys",
  ) => (
    <fieldset className={styles.fieldset}>
      <legend className={form.label}>{legend}</legend>
      <div className={form.chips}>
        {all.map((v) => (
          <button
            key={v}
            type="button"
            className={form.chip}
            aria-pressed={selected.includes(v)}
            onClick={() => set({ [key]: toggle(selected, v) } as Partial<SearchConditions>)}
          >
            {label(v)}
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className={styles.root}>
      {showKeyword && (
        <div className={styles.block}>
          <label htmlFor={`${id}-q`} className={form.label}>
            キーワード
          </label>
          <input
            id={`${id}-q`}
            type="search"
            className={form.input}
            value={c.q}
            placeholder="曲名・アーティスト・メモ・タグ"
            autoComplete="off"
            onChange={(e) => set({ q: e.target.value })}
          />
        </div>
      )}

      <section className={styles.block} aria-labelledby={`${id}-tags`}>
        <h2 id={`${id}-tags`} className={form.sectionTitle}>
          タグ
        </h2>
        <p className={form.hint}>タップするたびに「含める → 除外 → 解除」と切り替わります</p>
        {byGroup.length === 0 ? (
          <p className={form.hint}>タグがまだありません。</p>
        ) : (
          byGroup.map((g) => (
            <div key={g.name} className={styles.group}>
              <h3 className={styles.groupName}>{g.name}</h3>
              <div className={form.chips}>{g.tags.map(chip)}</div>
            </div>
          ))
        )}
      </section>

      <fieldset className={styles.fieldset}>
        <legend className={form.sectionTitle}>タグの組み合わせ</legend>
        <div className={styles.segment}>
          <button
            type="button"
            aria-pressed={c.tagMode === "and"}
            onClick={() => set({ tagMode: "and" })}
          >
            すべて含む（AND）
          </button>
          <button
            type="button"
            aria-pressed={c.tagMode === "or"}
            onClick={() => set({ tagMode: "or" })}
          >
            どれか（OR）
          </button>
        </div>
      </fieldset>

      <details className={styles.advanced} open={advancedOpen || undefined}>
        <summary>詳しい条件（アーティスト・年代・長さ・キーなど）</summary>
        <div className={styles.advancedBody}>
          <div className={styles.block}>
            <label htmlFor={`${id}-artist`} className={form.label}>
              アーティスト
            </label>
            <input
              id={`${id}-artist`}
              className={form.input}
              value={c.artist}
              maxLength={100}
              onChange={(e) => set({ artist: e.target.value })}
            />
          </div>
          <div className={styles.block}>
            <label htmlFor={`${id}-genre`} className={form.label}>
              ジャンル
            </label>
            <input
              id={`${id}-genre`}
              className={form.input}
              value={c.genre}
              maxLength={100}
              placeholder="例：J-Pop"
              onChange={(e) => set({ genre: e.target.value })}
            />
          </div>
          {multi("リリース年代", DECADES, c.decades, (d) => `${d}年代`, "decades")}
          {multi("曲の長さ", DURATION_BUCKETS, c.durations, (d) => DURATION_LABELS[d], "durations")}
          {multi("キー", KEY_BUCKETS, c.keys, (k) => KEY_LABELS[k], "keys")}
          <fieldset className={styles.fieldset}>
            <legend className={form.label}>直近の歌いやすさ</legend>
            <div className={form.chips}>
              {LAST_EASES.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={form.chip}
                  aria-pressed={c.lastEase === e}
                  onClick={() => set({ lastEase: c.lastEase === e ? null : e })}
                >
                  {LAST_EASE_LABELS[e]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </details>

      {showSort && (
        <fieldset className={styles.fieldset}>
          <legend className={form.sectionTitle}>並び順</legend>
          <div className={styles.radios}>
            {SORT_KEYS.map((k) => (
              <label key={k}>
                <input
                  type="radio"
                  name={`${id}-sort`}
                  checked={(c.sort ?? "created_desc") === k}
                  onChange={() => set({ sort: k })}
                />
                {SORT_LABELS[k]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
