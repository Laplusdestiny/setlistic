"use client";

import { useEffect, useId, useRef, useState } from "react";
import { pickRandom, slotIntervals, slotSequence } from "@/lib/search/conditions";
import type { SongRow } from "@/lib/songs/queries";
import styles from "./randomSlot.module.css";

/** 1回の抽選。当選曲と、そこへ至る候補の列・切り替え間隔をまとめて先に決める */
export type SlotDraw = { song: SongRow; seq: SongRow[]; gaps: number[] };
/** 抽選の結果。exhausted は、表示している曲を今日すべて歌っていて選べないとき（Issue #67） */
export type SlotResult = SlotDraw | { exhausted: true };

const STEPS = 16;
const DURATION_MS = 1500;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * 抽選する（演出は見た目だけで、結果はここで確定）。曲が無ければ null。
 * 今日（today）歌った曲は、当選曲にも流れる曲名にも出さない。全部歌っていたら exhausted。
 * 動きを減らす設定のときは演出なし（候補の列が当選曲だけ）
 */
export function drawSlot(
  songs: readonly SongRow[],
  today: string,
  rng: () => number = Math.random,
): SlotResult | null {
  if (songs.length === 0) return null;
  const candidates = songs.filter((s) => s.lastSungAt !== today);
  const song = pickRandom(candidates, rng);
  if (!song) return { exhausted: true };
  if (window.matchMedia(REDUCED_MOTION).matches) return { song, seq: [song], gaps: [] };
  return {
    song,
    seq: slotSequence(candidates, song, STEPS, rng),
    gaps: slotIntervals(STEPS - 1, DURATION_MS),
  };
}

type Props = {
  /** drawSlot の結果。「もう一回」のたびに新しく作る。null で閉じる */
  target: SlotResult | null;
  onDecide: (id: string) => void;
  onRetry: () => void;
  onClose: () => void;
};

/** ランダムに1曲選ぶときのスロット演出。曲名が切り替わりながら減速し、当選曲で止まる */
export function RandomSlot({ target, onDecide, onRetry, onClose }: Props) {
  const headingId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const reel = useRef<HTMLDivElement>(null);

  // 何番目の候補を出しているか。抽選が替わったら先頭に戻す
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(target);
  if (target !== seen) {
    setSeen(target);
    setStep(0);
  }
  const draw = target && "seq" in target ? target : null;
  const exhausted = target !== null && draw === null;
  const last = draw ? draw.seq.length - 1 : 0;
  const spinning = draw !== null && step < last;
  const shown = draw?.seq[Math.min(step, last)] ?? null;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (target && !el.open) el.showModal();
    else if (!target && el.open) el.close();
    // 演出中は押せるボタンが無い。1回目は開いたときにダイアログ自体へフォーカスが乗るが、
    // 「もう一回」では押したボタンが消えて本文へ外れてしまうので、回すたびにダイアログへ置き直す
    // （Enter・Space でのスキップを効かせ、見た目もそろえる。演出なしで結果が出たときは「これにする」のまま）
    if (draw && draw.seq.length > 1) el.focus();
  }, [target, draw]);

  // 次の候補へ。止まったら短く振動させる（対応端末だけ）
  useEffect(() => {
    if (!draw || step >= last) return;
    const timer = setTimeout(() => {
      setStep(step + 1);
      if (step + 1 === last) navigator.vibrate?.(15);
    }, draw.gaps[step]);
    return () => clearTimeout(timer);
  }, [draw, step, last]);

  const skip = () => {
    setStep(last);
    navigator.vibrate?.(15);
  };

  // 曲名が替わるたびに上から落としてくる（transform / opacity だけ動かす）
  useEffect(() => {
    if (!spinning) return;
    reel.current?.animate?.(
      [
        { transform: "translateY(-40%)", opacity: 0.2 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 90, easing: "ease-out" },
    );
  }, [step, spinning]);

  const decided = !spinning && shown;

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      tabIndex={-1}
      aria-labelledby={headingId}
      onClose={onClose}
      onCancel={(e) => {
        // 演出中の Esc はスキップ。結果が出てからは閉じる
        if (spinning) {
          e.preventDefault();
          skip();
        }
      }}
      onKeyDown={(e) => {
        if (spinning && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          skip();
        }
      }}
      onClick={(e) => {
        if (spinning) skip();
        else if (e.target === e.currentTarget) dialog.current?.close();
      }}
    >
      <div className={styles.body} data-state={spinning ? "spinning" : "result"}>
        <h2 id={headingId} className={styles.heading}>
          ランダムに1曲
        </h2>
        {exhausted ? (
          <>
            <p className={styles.exhausted}>
              今日は、いま表示している曲をすべて歌いました。絞り込みを変えると、ほかの曲から選べます。
            </p>
            <div className={styles.buttons}>
              <button
                type="button"
                className={styles.primary}
                autoFocus
                onClick={() => dialog.current?.close()}
              >
                閉じる
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.frame} aria-hidden={spinning}>
              {decided && <span className={styles.stamp}>今日の1曲</span>}
              <div ref={reel} className={styles.reel}>
                <p className={styles.title}>{shown?.title}</p>
                <p className={styles.artist}>{shown?.artist}</p>
              </div>
            </div>
            <p className="visually-hidden" aria-live="polite">
              {decided ? `「${shown.title}」（${shown.artist}）に決まりました` : ""}
            </p>
            {decided ? (
              <div className={styles.buttons}>
                <button type="button" className={styles.secondary} onClick={onRetry}>
                  もう一回
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  autoFocus
                  onClick={() => onDecide(shown.id)}
                >
                  これにする
                </button>
              </div>
            ) : (
              <p className={styles.hint}>タップでスキップ</p>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
