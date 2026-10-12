"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import styles from "./settings.module.css";

type ImportResult =
  | {
      ok: true;
      result: {
        songs_added: number;
        songs_skipped: number;
        tags_added: number;
        fields_added: number;
      };
      warnings: string[];
    }
  | { ok: false; error: string };

export function DataSection() {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/import", { method: "POST", body });
      setResult((await res.json()) as ImportResult);
      if (res.ok) {
        setFile(null);
        if (input.current) input.current.value = "";
        router.refresh();
      }
    } catch {
      setResult({ ok: false, error: "通信に失敗しました。もう一度お試しください。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="data" className={styles.card} aria-labelledby="data-h">
      <h2 id="data-h">データ</h2>

      <div className={styles.field}>
        <span className={styles.label}>エクスポート</span>
        <p className={styles.hint}>
          曲・タグ・カスタム項目・歌唱記録をまとめて書き出します。JSONは別のアカウントへの取り込み（インポート）にも使えます。
        </p>
        <div className={styles.buttons}>
          <a className={styles.secondary} href="/api/export?format=json" download>
            JSONでエクスポート
          </a>
          <a className={styles.secondary} href="/api/export?format=csv" download>
            CSVでエクスポート
          </a>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-f`} className={styles.label}>
          インポート（JSON）
        </label>
        <p className={styles.hint}>
          Setlistic
          のJSONエクスポートを取り込みます。今あるデータは消えず、追加のみです。同じ曲（Apple Music
          の曲ID）は取り込みません。
        </p>
        <input
          id={`${id}-f`}
          ref={input}
          type="file"
          accept="application/json,.json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button type="button" className={styles.primary} disabled={!file || busy} onClick={upload}>
          {busy ? "取り込み中…" : "取り込む"}
        </button>
      </div>

      {result &&
        (result.ok ? (
          <div role="status" className={styles.ok}>
            <p>
              取り込みました：曲 {result.result.songs_added}件を追加
              {result.result.songs_skipped > 0 &&
                `（${result.result.songs_skipped}件は登録済みのためスキップ）`}
              、タグ {result.result.tags_added}件、項目 {result.result.fields_added}件を追加。
            </p>
            {result.warnings.length > 0 && (
              <ul>
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p role="alert" className={styles.error}>
            {result.error}
          </p>
        ))}
    </section>
  );
}
