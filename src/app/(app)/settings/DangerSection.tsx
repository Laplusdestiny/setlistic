"use client";

import { useId, useRef, useState, useTransition } from "react";
import { deleteAccountAction } from "./actions";
import styles from "./settings.module.css";

export function DangerSection() {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      // 成功すると login へリダイレクトされる（戻り値が返るのは失敗のとき）
      const res = await deleteAccountAction(text);
      if (res?.status === "error") setError(res.message);
    });
  }

  return (
    <section id="danger" className={styles.card} aria-labelledby="danger-h">
      <h2 id="danger-h">アカウントの削除</h2>
      <p className={styles.hint}>
        アカウントと、登録した曲・タグ・項目・歌唱記録など、すべてのデータを削除します。元に戻せません。必要なら先にエクスポートしてください。
      </p>
      <button
        type="button"
        className={styles.dangerLink}
        onClick={() => {
          setText("");
          setError(null);
          dialog.current?.showModal();
        }}
      >
        アカウントを削除
      </button>

      <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>本当に削除しますか？</h2>
        <p>
          すべてのデータが削除され、元に戻せません。確認のため、下の欄に「削除」と入力してください。
        </p>
        <label htmlFor={`${id}-c`} className="visually-hidden">
          確認のため「削除」と入力
        </label>
        <input
          id={`${id}-c`}
          className={styles.input}
          value={text}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          placeholder="削除"
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
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
            disabled={pending || text !== "削除"}
            onClick={submit}
          >
            {pending ? "削除中…" : "削除する"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
