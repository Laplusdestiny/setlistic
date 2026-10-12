"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { saveSearchAction } from "@/app/(app)/search/actions";
import type { SearchConditions } from "@/lib/search/conditions";
import { SAVED_NAME_MAX } from "@/lib/search/saved";
import form from "./form.module.css";
import styles from "./save-search.module.css";

type Props = {
  conditions: SearchConditions;
  suggestedName: string;
  onSaved?: () => void;
};

/** 今の条件に名前を付けて保存する（よく使う条件をワンタップで呼び出すため） */
export function SaveSearchForm({ conditions, suggestedName, onSaved }: Props) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(suggestedName);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMessage(null);
    start(async () => {
      const res = await saveSearchAction({ name, conditions });
      if (res.status === "ok") {
        setMessage({ kind: "ok", text: "保存しました" });
        router.refresh();
        onSaved?.();
      } else setMessage({ kind: "error", text: res.message });
    });
  }

  return (
    <form
      className={styles.root}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor={id} className={form.label}>
        この条件に名前を付けて保存
      </label>
      <div className={styles.row}>
        <input
          id={id}
          className={form.input}
          value={name}
          maxLength={SAVED_NAME_MAX}
          placeholder="例：1曲目向きの十八番"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className={form.dark} disabled={pending || !name.trim()}>
          {pending ? "保存中…" : "保存"}
        </button>
      </div>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`${form.hint} ${message.kind === "error" ? form.error : ""}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
