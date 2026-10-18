"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  deleteSingLogAction,
  deleteSongAction,
  recordSingAction,
  updateSongAction,
} from "@/app/(app)/songs/actions";
import { formatFieldValue, visibleFields, type CustomField } from "@/lib/custom-fields";
import { formatDateJa } from "@/lib/format";
import { formatKey } from "@/lib/songs/key";
import type { SingState, SongRow } from "@/lib/songs/queries";
import type { GroupOption, NewTag, TagOption } from "@/lib/tags/types";
import { FieldInputs } from "./FieldInputs";
import { KeyStepper } from "./KeyStepper";
import { TagPicker } from "./TagPicker";
import form from "./form.module.css";
import styles from "./song-detail.module.css";

type Props = {
  song: SongRow;
  groups: GroupOption[];
  allTags: TagOption[];
  /** カスタム項目の定義（非表示のものも含めて渡す。表示側で絞る） */
  fields: CustomField[];
  initialSing: SingState;
  /** 今日の日付（日本時間, YYYY-MM-DD）。サーバーで決めて渡す */
  today: string;
  /** 削除後の遷移などを呼び出し側が決める */
  onDeleted: () => void;
  /** 編集フォームを開いた状態で始める（チュートリアルの「タグを付ける」から来たとき） */
  initialEditing?: boolean;
};

const EASE_LABELS = ["余裕", "歌いやすい", "ふつう", "やや辛い", "辛かった"];

export function SongDetail({
  song,
  groups,
  allTags,
  fields,
  initialSing,
  today,
  onDeleted,
  initialEditing = false,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(initialEditing);
  const [singOpen, setSingOpen] = useState(false);
  const [sing, setSing] = useState(initialSing);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // 編集フォーム
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [songKey, setSongKey] = useState(song.songKey ?? 0);
  const [memo, setMemo] = useState(song.memo ?? "");
  const shownFields = visibleFields(fields);
  const currentFieldValues = () =>
    Object.fromEntries(shownFields.map((f) => [f.id, song.fields[f.id] ?? null]));
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(() =>
    initialEditing ? currentFieldValues() : {},
  );
  const [selected, setSelected] = useState(() => new Set(song.tags.map((t) => t.id)));
  const [newTags, setNewTags] = useState<NewTag[]>([]);

  // 歌唱記録フォーム
  const [sungAt, setSungAt] = useState(today);
  const [ease, setEase] = useState<number | null>(null);
  const [note, setNote] = useState("");

  function startEdit() {
    setTitle(song.title);
    setArtist(song.artist);
    setSongKey(song.songKey ?? 0);
    setMemo(song.memo ?? "");
    setFieldValues(currentFieldValues());
    setSelected(new Set(song.tags.map((t) => t.id)));
    setNewTags([]);
    setError(null);
    setEditing(true);
  }

  function saveEdit() {
    setError(null);
    start(async () => {
      const res = await updateSongAction({
        id: song.id,
        title,
        artist,
        songKey,
        memo,
        fields: fieldValues,
        tagIds: [...selected],
        newTags,
      });
      if (res.status === "ok") {
        setEditing(false);
        router.refresh();
      } else setError(res.message);
    });
  }

  function recordSing() {
    setError(null);
    start(async () => {
      const res = await recordSingAction({ songId: song.id, sungAt, ease, note });
      if (res.status === "ok") {
        setSing(res.state);
        setSingOpen(false);
        setEase(null);
        setNote("");
        setSungAt(today);
        router.refresh();
      } else setError(res.message);
    });
  }

  function removeLog(logId: string) {
    setError(null);
    start(async () => {
      const res = await deleteSingLogAction(song.id, logId);
      if (res.status === "ok") {
        setSing(res.state);
        router.refresh();
      } else setError(res.message);
    });
  }

  function confirmDelete() {
    start(async () => {
      const res = await deleteSongAction(song.id);
      if (res.status === "ok") {
        dialog.current?.close();
        router.refresh();
        onDeleted();
      } else {
        dialog.current?.close();
        setError(res.message);
      }
    });
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (editing) {
    return (
      <form
        className={styles.root}
        onSubmit={(e) => {
          e.preventDefault();
          saveEdit();
        }}
      >
        <h2 className={form.sectionTitle}>曲を編集</h2>
        <label className={form.label} htmlFor={`t-${song.id}`}>
          曲名
        </label>
        <input
          id={`t-${song.id}`}
          className={form.input}
          value={title}
          maxLength={200}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className={form.label} htmlFor={`a-${song.id}`}>
          アーティスト
        </label>
        <input
          id={`a-${song.id}`}
          className={form.input}
          value={artist}
          maxLength={200}
          required
          onChange={(e) => setArtist(e.target.value)}
        />

        <div className={styles.keyRow}>
          <span className={form.label}>キー</span>
          <KeyStepper value={songKey} onChange={setSongKey} />
        </div>

        <TagPicker
          groups={groups}
          tags={allTags}
          selectedIds={selected}
          newTags={newTags}
          onToggle={toggle}
          onSelect={(id) => setSelected((prev) => new Set(prev).add(id))}
          onAddNew={(t) => setNewTags((prev) => [...prev, t])}
          onRemoveNew={(name) => setNewTags((prev) => prev.filter((t) => t.name !== name))}
        />

        <label className={form.label} htmlFor={`m-${song.id}`}>
          メモ
        </label>
        <textarea
          id={`m-${song.id}`}
          className={form.textarea}
          rows={4}
          maxLength={2000}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="サビ前で息継ぎ、など"
        />

        <FieldInputs
          fields={shownFields}
          values={fieldValues}
          onChange={(id, v) => setFieldValues((prev) => ({ ...prev, [id]: v }))}
        />

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.buttons}>
          <button
            type="submit"
            className={styles.primary}
            disabled={pending || !title.trim() || !artist.trim()}
          >
            {pending ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={pending}
            onClick={() => setEditing(false)}
          >
            キャンセル
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span className={styles.pill}>SET LIST</span>
        <h1 className={styles.title}>{song.title}</h1>
        <p className={styles.artist}>{song.artist}</p>
        {song.tags.length > 0 && (
          <ul className={styles.tags} aria-label="タグ">
            {song.tags.map((t) => (
              <li key={t.id}>#{t.name}</li>
            ))}
          </ul>
        )}
      </div>

      <dl className={styles.stats}>
        <div>
          <dt>キー</dt>
          <dd>{song.songKey === null ? "—" : formatKey(song.songKey)}</dd>
        </div>
        <div>
          <dt>歌った回数</dt>
          <dd>{sing.sungCount}回</dd>
        </div>
        <div>
          <dt>最後に歌った日</dt>
          <dd className={styles.date}>{sing.lastSungAt ? formatDateJa(sing.lastSungAt) : "—"}</dd>
        </div>
      </dl>

      {shownFields.some((f) => formatFieldValue(f, song.fields[f.id]) !== "") && (
        <dl className={styles.fieldList} aria-label="項目">
          {shownFields.map((f) => {
            const text = formatFieldValue(f, song.fields[f.id]);
            return text ? (
              <div key={f.id}>
                <dt>{f.name}</dt>
                <dd>{text}</dd>
              </div>
            ) : null;
          })}
        </dl>
      )}

      {song.memo && (
        <section className={styles.memo}>
          <h2>メモ</h2>
          <p>{song.memo}</p>
        </section>
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.actions}>
        {!singOpen ? (
          <button type="button" className={styles.primary} onClick={() => setSingOpen(true)}>
            今日歌った！を記録
          </button>
        ) : (
          <form
            className={styles.singForm}
            onSubmit={(e) => {
              e.preventDefault();
              recordSing();
            }}
          >
            <h2 className={form.sectionTitle}>歌唱記録</h2>
            <label className={form.label} htmlFor={`d-${song.id}`}>
              歌った日
            </label>
            <input
              id={`d-${song.id}`}
              type="date"
              className={form.input}
              value={sungAt}
              max={today}
              required
              onChange={(e) => setSungAt(e.target.value)}
            />

            <fieldset className={styles.ease}>
              <legend className={form.label}>歌いやすさ（任意）</legend>
              <div className={styles.easeButtons}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={form.chip}
                    aria-pressed={ease === n}
                    aria-label={`${n}（${EASE_LABELS[n - 1]}）`}
                    onClick={() => setEase(ease === n ? null : n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className={form.hint}>1 余裕 ← → 5 辛かった</span>
            </fieldset>

            <label className={form.label} htmlFor={`n-${song.id}`}>
              ひとことメモ（任意）
            </label>
            <input
              id={`n-${song.id}`}
              className={form.input}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="高音が出づらかった、など"
            />

            <div className={styles.buttons}>
              <button type="submit" className={styles.primary} disabled={pending}>
                {pending ? "記録中…" : "記録する"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={pending}
                onClick={() => setSingOpen(false)}
              >
                やめる
              </button>
            </div>
          </form>
        )}

        <button type="button" className={styles.secondary} onClick={startEdit}>
          編集
        </button>
        {song.appleUrl && (
          <a
            className={styles.secondary}
            href={song.appleUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apple Musicで開く
          </a>
        )}
      </div>

      <section className={styles.history} aria-labelledby={`h-${song.id}`}>
        <h2 id={`h-${song.id}`}>歌唱記録</h2>
        {sing.logs.length === 0 ? (
          <p className={form.hint}>まだ記録がありません。</p>
        ) : (
          <ul>
            {sing.logs.map((l) => (
              <li key={l.id}>
                <div>
                  <strong>{formatDateJa(l.sungAt)}</strong>
                  {l.ease && <span className={styles.easeBadge}>歌いやすさ {l.ease}</span>}
                  {l.note && <p>{l.note}</p>}
                </div>
                <button
                  type="button"
                  className={styles.link}
                  disabled={pending}
                  onClick={() => removeLog(l.id)}
                  aria-label={`${formatDateJa(l.sungAt)}の記録を削除`}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className={styles.danger} onClick={() => dialog.current?.showModal()}>
        この曲を削除
      </button>

      <dialog ref={dialog} className={styles.dialog} aria-labelledby={`dt-${song.id}`}>
        <h2 id={`dt-${song.id}`}>この曲を削除しますか？</h2>
        <p>「{song.title}」と、その歌唱記録・タグの紐づけがすべて消えます。元に戻せません。</p>
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => dialog.current?.close()}
          >
            キャンセル
          </button>
          <button
            type="button"
            className={styles.dangerSolid}
            disabled={pending}
            onClick={confirmDelete}
          >
            {pending ? "削除中…" : "削除する"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
