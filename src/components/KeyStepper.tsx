"use client";

import { useId } from "react";
import { clampKey, formatKey } from "@/lib/songs/key";
import styles from "./form.module.css";

/** キーを −7〜+7 の範囲で 1 ずつ増減する */
export function KeyStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (key: number) => void;
}) {
  const id = useId();
  return (
    <div className={styles.stepper} role="group" aria-labelledby={id}>
      <span id={id} className="visually-hidden">
        キー
      </span>
      <button
        type="button"
        className={styles.step}
        aria-label="キーを下げる"
        onClick={() => onChange(clampKey(value - 1))}
      >
        −
      </button>
      <span className={styles.keyValue} aria-live="polite">
        {formatKey(value)}
      </span>
      <button
        type="button"
        className={styles.step}
        aria-label="キーを上げる"
        onClick={() => onChange(clampKey(value + 1))}
      >
        ＋
      </button>
    </div>
  );
}
