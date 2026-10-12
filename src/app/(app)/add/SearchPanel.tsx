"use client";

import { useEffect, useRef, useState } from "react";
import type { SongDraft } from "@/lib/songs/types";
import { searchSongsAction } from "./actions";
import styles from "./add.module.css";

type Item = SongDraft & { duplicate: boolean };

const DEBOUNCE_MS = 700;
// iTunes Search API の目安は約20回/分。連続入力でも 3.2 秒に1回までにする
const MIN_INTERVAL_MS = 3200;

export function SearchPanel({ onPick }: { onPick: (draft: SongDraft) => void }) {
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const lastCall = useRef(0);
  const seq = useRef(0);

  function onTermChange(value: string) {
    setTerm(value);
    if ([...value.trim()].length < 2) {
      seq.current++; // 実行中の検索の応答は捨てる
      setItems(null);
      setState("idle");
    }
  }

  useEffect(() => {
    const q = term.trim();
    if ([...q].length < 2) return;
    const wait = Math.max(DEBOUNCE_MS, lastCall.current + MIN_INTERVAL_MS - Date.now());
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      lastCall.current = Date.now();
      setState("loading");
      const res = await searchSongsAction(q);
      if (id !== seq.current) return; // 古い応答は捨てる
      if (res.status === "ok") {
        setItems(res.results);
        setState("idle");
      } else {
        setState("error");
      }
    }, wait);
    return () => clearTimeout(timer);
  }, [term]);

  return (
    <div className={styles.panel}>
      <label htmlFor="song-search" className={styles.label}>
        曲名・アーティスト名で探す
      </label>
      <input
        id="song-search"
        type="search"
        className={styles.input}
        value={term}
        onChange={(e) => onTermChange(e.target.value)}
        placeholder="例：夜に駆ける YOASOBI"
        autoComplete="off"
        enterKeyHint="search"
      />
      <p className={styles.hint} aria-live="polite">
        {state === "loading" && "検索中…"}
        {state === "error" && "検索できませんでした。時間をおいてもう一度お試しください。"}
        {state === "idle" &&
          items?.length === 0 &&
          "見つかりませんでした。別のキーワードか、手入力をお試しください。"}
      </p>
      {items && items.length > 0 && (
        <ul className={styles.results}>
          {items.map((r) => (
            <li key={r.appleTrackId}>
              <button
                type="button"
                className={styles.result}
                disabled={r.duplicate}
                onClick={() => onPick(r)}
              >
                <strong>{r.title}</strong>
                <span className={styles.songArtist}>
                  {r.artist}
                  {r.album ? ` ／ ${r.album}` : ""}
                </span>
                {r.duplicate && <span className={styles.hint}>登録済み</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
