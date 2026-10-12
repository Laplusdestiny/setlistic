"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { lookupManyAction, saveManyAction } from "./actions";
import { lookupErrorMessage } from "./messages";
import type { BulkItem, BulkSaveItem } from "./types";
import styles from "./add.module.css";

const MAX = 20;

export function BulkAdd() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<BulkItem[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<BulkSaveItem[] | null>(null);
  const [pending, start] = useTransition();

  const urls = text.match(/https?:\/\/[^\s<>"']+/g) ?? [];

  function fetchAll() {
    setSaved(null);
    start(async () => {
      const res = await lookupManyAction(urls.slice(0, MAX));
      setItems(res);
      setChecked(
        new Set(
          res.flatMap((r, i) => (r.result.status === "ok" && !r.result.duplicate ? [i] : [])),
        ),
      );
    });
  }

  function saveChecked() {
    if (!items) return;
    const drafts = items.flatMap((r, i) =>
      checked.has(i) && r.result.status === "ok" ? [r.result.draft] : [],
    );
    start(async () => {
      setSaved(await saveManyAction(drafts));
      setItems(null);
      setText("");
    });
  }

  return (
    <div className={styles.panel}>
      <p className={styles.lead}>
        共有URLを複数まとめて貼り付けてください（1回につき{MAX}
        件まで）。タグは「登録時に付けるタグ」だけが付きます。
        細かいタグやキーはあとから編集できます。
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
        placeholder={"https://music.apple.com/jp/album/…?i=…\nhttps://music.apple.com/jp/song/…"}
      />
      <button
        type="button"
        className={styles.primary}
        disabled={pending || urls.length === 0}
        onClick={fetchAll}
      >
        {pending && !items ? "取得中…" : `${Math.min(urls.length, MAX)}件の曲情報を取得`}
      </button>
      {urls.length > MAX && (
        <p className={styles.hint}>
          {MAX}件を超えた分は取得しません。残りは次の回に貼り付けてください。
        </p>
      )}

      {items && (
        <>
          <ul className={styles.results}>
            {items.map((r, i) => {
              const ok = r.result.status === "ok";
              const dup = r.result.status === "ok" && r.result.duplicate !== null;
              return (
                <li key={i}>
                  <label className={styles.bulkRow}>
                    <input
                      type="checkbox"
                      disabled={!ok || dup}
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
          <button
            type="button"
            className={styles.primary}
            disabled={pending || checked.size === 0}
            onClick={saveChecked}
          >
            {pending ? "保存中…" : `選んだ${checked.size}曲をセトリに追加`}
          </button>
        </>
      )}

      {saved && (
        <div role="status" className={styles.notice}>
          {saved.filter((s) => s.status === "ok").length}曲を追加しました。
          {saved.some((s) => s.status !== "ok") &&
            `（${saved.filter((s) => s.status !== "ok").length}曲は登録済み、または保存できませんでした）`}{" "}
          <Link href="/">セトリを見る</Link>
        </div>
      )}
    </div>
  );
}
