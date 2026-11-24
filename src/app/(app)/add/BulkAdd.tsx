"use client";

import Link from "next/link";
import { useState } from "react";
import { TagPicker } from "@/components/TagPicker";
import { sameSongKey } from "@/lib/songs/bulk";
import type { SongDraft } from "@/lib/songs/types";
import type { GroupOption, NewTag, TagOption } from "@/lib/tags/types";
import { lookupFromUrl, saveBulkItemAction } from "./actions";
import { lookupErrorMessage, SERVICE_NAMES } from "./messages";
import type { BulkItem, BulkSaveItem, LookupResult } from "./types";
import styles from "./add.module.css";

const MAX = 20;

/** 保存できる結果か（アーティスト不明のまま取得元の表記を使うものは、1曲ずつ登録で直してもらう） */
const savable = (r: LookupResult) =>
  r.status === "ok" && r.duplicate === null && r.draft.artist.trim() !== "";

/** 最初から選んでおくのは、Apple Music の曲として確実に見つかったものだけ */
const preselect = (r: LookupResult) =>
  savable(r) && r.status === "ok" && (!r.external || r.external.confidence === "confident");

/** Spotify / YouTube Music の結果に添える注記 */
function externalNote(r: LookupResult): string | null {
  if (r.status !== "ok" || !r.external) return null;
  const name = SERVICE_NAMES[r.external.service];
  switch (r.external.confidence) {
    case "confident":
      return null;
    case "needs_confirmation":
      return `要確認：${name} では「${r.external.source.draft.title}」。表記の違う同じ曲か確かめてから選んでください`;
    case "not_found":
      return r.draft.artist.trim()
        ? `Apple Music で見つからなかったため ${name} の表記のまま`
        : `アーティストが分からないため、1曲ずつ登録で入力してください`;
  }
}

/** 1曲の取得。通信の失敗などで例外になっても、その曲だけ失敗にして残りを続ける */
async function lookupOne(input: string): Promise<LookupResult> {
  try {
    return await lookupFromUrl(input);
  } catch {
    return { status: "error", reason: "network" };
  }
}

async function saveOne(
  draft: SongDraft,
  tagIds: string[],
  newTags: NewTag[],
): Promise<BulkSaveItem> {
  try {
    return await saveBulkItemAction(draft, tagIds, newTags);
  } catch {
    return { title: draft.title, status: "error" };
  }
}

/** 取得・保存の進み具合。1曲ずつサーバーを呼び、終わるたびに進める */
type Progress = { kind: "lookup" | "save"; done: number; total: number };

const PROGRESS_LABELS = {
  lookup: { name: "曲情報の取得", text: "曲情報を取得中…" },
  save: { name: "セトリへの追加", text: "セトリに追加中…" },
} as const;

function ProgressBar({ kind, done, total }: Progress) {
  const label = PROGRESS_LABELS[kind];
  return (
    <div className={styles.progress}>
      <progress max={total} value={done} aria-label={label.name} />
      <p aria-live="polite">
        {label.text} {done} / {total}
      </p>
    </div>
  );
}

type Props = {
  groups: GroupOption[];
  tags: TagOption[];
  defaultTagIds: string[];
  /** あと何曲登録できるか（上限まで）。不明なら null */
  remaining: number | null;
};

export function BulkAdd({ groups, tags, defaultTagIds, remaining }: Props) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<BulkItem[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<BulkSaveItem[] | null>(null);
  // 取り込む曲すべてに付けるタグ（最初は「登録時に付けるタグ」）
  const [tagIds, setTagIds] = useState<Set<string>>(new Set(defaultTagIds));
  const [newTags, setNewTags] = useState<NewTag[]>([]);
  // 1曲ずつ順に呼ぶ長い処理なので useTransition は使わない（途中の進み具合をすぐ画面に出すため）
  const [progress, setProgress] = useState<Progress | null>(null);
  const busy = progress !== null;

  const overLimit = remaining !== null && checked.size > remaining;
  const urls = text.match(/https?:\/\/[^\s<>"']+/g) ?? [];

  /** 1曲ずつ取得する（iTunes API の目安は約20回/分なので、まとめて投げずに順に呼ぶ） */
  async function fetchAll() {
    setSaved(null);
    const list = urls.slice(0, MAX);
    const out: BulkItem[] = [];
    const seen = new Set<string>();
    setProgress({ kind: "lookup", done: 0, total: list.length });
    for (const input of list) {
      const key = sameSongKey(input);
      // 同じ貼り付けの中の同じ曲は、取得せずに印だけ付ける
      if (key && seen.has(key)) {
        out.push({ input, result: { status: "error", reason: "not_found" }, repeated: true });
      } else {
        if (key) seen.add(key);
        out.push({ input, result: await lookupOne(input) });
      }
      setProgress({ kind: "lookup", done: out.length, total: list.length });
    }
    setProgress(null);
    setItems(out);
    setChecked(new Set(out.flatMap((r, i) => (preselect(r.result) ? [i] : []))));
  }

  async function saveChecked() {
    if (!items) return;
    const drafts = items.flatMap((r, i) =>
      checked.has(i) && r.result.status === "ok" ? [r.result.draft] : [],
    );
    const out: BulkSaveItem[] = [];
    setProgress({ kind: "save", done: 0, total: drafts.length });
    for (const draft of drafts) {
      const res = await saveOne(draft, [...tagIds], newTags);
      out.push(res);
      setProgress({ kind: "save", done: out.length, total: drafts.length });
      // 上限に達したら、残りは試さずに止める
      if (res.status === "limit") break;
    }
    setProgress(null);
    setSaved(out);
    setItems(null);
    setText("");
  }

  return (
    <div className={styles.panel}>
      <p className={styles.lead}>
        共有URLを複数まとめて貼り付けてください（1回につき{MAX}
        件まで）。下で選んだタグが、取り込む曲すべてに付きます。付け忘れても、あとから「タグの一括変更」で直せます。
      </p>
      <label htmlFor="bulk-urls" className={styles.label}>
        共有URL（改行区切り）
      </label>
      <textarea
        id="bulk-urls"
        className={styles.textarea}
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          "https://music.apple.com/jp/album/…?i=…\nhttps://open.spotify.com/track/…\nhttps://music.youtube.com/watch?v=…"
        }
      />
      <button
        type="button"
        className={styles.primary}
        disabled={busy || urls.length === 0}
        onClick={fetchAll}
      >
        {progress?.kind === "lookup" ? "取得中…" : `${Math.min(urls.length, MAX)}件の曲情報を取得`}
      </button>
      {progress?.kind === "lookup" && <ProgressBar {...progress} />}
      {urls.length > MAX && (
        <p className={styles.hint}>
          {MAX}件を超えた分は取得しません。残りは次の回に貼り付けてください。
        </p>
      )}

      {items && (
        <>
          <ul className={styles.results}>
            {items.map((r, i) => {
              const dup = r.result.status === "ok" && r.result.duplicate !== null;
              const note = externalNote(r.result);
              return (
                <li key={i}>
                  <label className={styles.bulkRow}>
                    <input
                      type="checkbox"
                      disabled={!savable(r.result)}
                      checked={checked.has(i)}
                      onChange={() =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(i)) next.add(i);
                          return next;
                        })
                      }
                    />
                    <span>
                      {r.result.status === "ok" ? (
                        <>
                          <strong>{r.result.draft.title}</strong>
                          <br />
                          <span className={styles.songArtist}>{r.result.draft.artist}</span>
                          {dup && <span className={styles.hint}> ／ 登録済みのためスキップ</span>}
                          {note && !dup && (
                            <>
                              <br />
                              <span className={styles.hint}>{note}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <span className={styles.songArtist} style={{ overflowWrap: "anywhere" }}>
                            {r.input}
                          </span>
                          <br />
                          <span style={{ color: "var(--color-danger)", fontSize: 13 }}>
                            {r.repeated
                              ? "同じ曲が上にあるためスキップ"
                              : lookupErrorMessage(r.result.reason, r.result.service)}
                          </span>
                        </>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <TagPicker
            groups={groups}
            tags={tags}
            selectedIds={tagIds}
            newTags={newTags}
            heading="取り込む曲すべてに付けるタグ"
            onToggle={(id) =>
              setTagIds((prev) => {
                const next = new Set(prev);
                if (!next.delete(id)) next.add(id);
                return next;
              })
            }
            onSelect={(id) => setTagIds((prev) => new Set(prev).add(id))}
            onAddNew={(t) => setNewTags((prev) => [...prev, t])}
            onRemoveNew={(name) => setNewTags((prev) => prev.filter((t) => t.name !== name))}
          />
          {overLimit && (
            <p role="alert" className={styles.error}>
              登録できる曲数の上限まで、あと{remaining}曲です。選ぶ曲を減らしてください。
            </p>
          )}
          <button
            type="button"
            className={styles.primary}
            disabled={busy || checked.size === 0 || overLimit}
            onClick={saveChecked}
          >
            {progress?.kind === "save" ? "保存中…" : `選んだ${checked.size}曲をセトリに追加`}
          </button>
          {progress?.kind === "save" && <ProgressBar {...progress} />}
        </>
      )}

      {saved && (
        <div role="status" className={styles.notice}>
          {saved.filter((s) => s.status === "ok").length}曲を追加しました。
          {saved.some((s) => s.status !== "ok") &&
            `（${saved.filter((s) => s.status !== "ok").length}曲は登録済み、または保存できませんでした）`}
          {saved.some((s) => s.status === "limit") &&
            " 曲数の上限に達したため、残りは登録していません。"}{" "}
          <Link href="/">セトリを見る</Link>
          {saved.some((s) => s.id) && (
            <>
              {" ／ "}
              <Link href={`/bulk?ids=${saved.flatMap((s) => (s.id ? [s.id] : [])).join(",")}`}>
                登録した曲のタグをまとめて変更
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
