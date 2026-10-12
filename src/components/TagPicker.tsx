"use client";

import { useId, useMemo, useState } from "react";
import { normalizeTagName, tagNameFromInput, validateTagName } from "@/lib/tags/normalize";
import { suggestTags } from "@/lib/tags/suggest";
import type { GroupOption, NewTag, TagOption } from "@/lib/tags/types";
import styles from "./form.module.css";

type Props = {
  groups: GroupOption[];
  tags: TagOption[];
  selectedIds: Set<string>;
  newTags: NewTag[];
  onToggle: (id: string) => void;
  onAddNew: (tag: NewTag) => void;
  onRemoveNew: (name: string) => void;
  /** 既存タグを選択状態にする */
  onSelect: (id: string) => void;
  /** 見出し（既定は「タグ」） */
  heading?: string;
};

export function TagPicker({
  groups,
  tags,
  selectedIds,
  newTags,
  onToggle,
  onAddNew,
  onRemoveNew,
  onSelect,
  heading = "タグ",
}: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const { matches, create } = useMemo(() => suggestTags(input, tags), [input, tags]);

  function commit() {
    const problem = validateTagName(input);
    if (problem) {
      setError(
        problem === "empty"
          ? input.trim()
            ? "タグ名を入力してください"
            : null
          : "タグは30文字までです",
      );
      return;
    }
    const name = tagNameFromInput(input);
    const key = normalizeTagName(name);
    const existing = tags.find((t) => normalizeTagName(t.name) === key);
    if (existing) onSelect(existing.id);
    else if (!newTags.some((t) => normalizeTagName(t.name) === key)) onAddNew({ name });
    setInput("");
    setError(null);
  }

  const byGroup = groups
    .map((g) => ({ group: g, tags: tags.filter((t) => t.groupId === g.id) }))
    .filter((g) => g.tags.length > 0);
  const ungrouped = tags.filter((t) => !t.groupId || !groups.some((g) => g.id === t.groupId));

  const chip = (t: TagOption) => (
    <button
      key={t.id}
      type="button"
      className={styles.chip}
      aria-pressed={selectedIds.has(t.id)}
      onClick={() => onToggle(t.id)}
    >
      #{t.name}
    </button>
  );

  return (
    <section className={styles.panel} aria-labelledby={`${listId}-h`}>
      <h2 id={`${listId}-h`} className={styles.sectionTitle}>
        {heading}
      </h2>
      <div className={styles.chips}>
        {byGroup.map(({ group, tags: ts }) => (
          <div key={group.id} style={{ display: "contents" }}>
            <p className={styles.groupName}>{group.name}</p>
            {ts.map(chip)}
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div style={{ display: "contents" }}>
            <p className={styles.groupName}>マイタグ</p>
            {ungrouped.map(chip)}
          </div>
        )}
        {newTags.map((t) => (
          <button
            key={t.name}
            type="button"
            className={styles.chip}
            data-new
            aria-pressed="true"
            aria-label={`#${t.name}（新規タグ）を外す`}
            onClick={() => onRemoveNew(t.name)}
          >
            #{t.name}
          </button>
        ))}
      </div>

      <label htmlFor={`${listId}-in`} className="visually-hidden">
        新しいタグ
      </label>
      <div className={styles.tagInput}>
        <input
          id={`${listId}-in`}
          className={styles.input}
          value={input}
          placeholder="新しいタグを入力（Enterで追加）"
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            // 日本語入力の変換確定のEnterでは追加しない
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button type="button" className={styles.dark} onClick={commit}>
          追加
        </button>
      </div>
      {input.trim() && (matches.length > 0 || create) && (
        <div className={styles.suggest} role="group" aria-label="タグの候補">
          <p className={styles.hint}>過去に作ったタグ</p>
          <ul>
            {matches.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={selectedIds.has(t.id)}
                  onClick={() => {
                    onToggle(t.id);
                    setInput("");
                    setError(null);
                  }}
                >
                  #{t.name}
                  <span>{selectedIds.has(t.id) ? "選択中（タップで外す）" : "タップで付ける"}</span>
                </button>
              </li>
            ))}
            {create && (
              <li>
                <button
                  type="button"
                  className={styles.suggestNew}
                  onClick={() => {
                    onAddNew({ name: create });
                    setInput("");
                    setError(null);
                  }}
                >
                  「#{create}」を新しいタグとして追加
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className={`${styles.hint} ${styles.error}`}>
          {error}
        </p>
      )}
    </section>
  );
}
