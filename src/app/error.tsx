"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./status.module.css";

/** 画面の描画中に起きた予期しないエラー。内容は Vercel のログ（vercel logs --level error）に出る */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className={styles.page}>
      <h1>うまく表示できませんでした</h1>
      <p>
        一時的な問題かもしれません。もう一度お試しください。続くときは、時間をおいてから開き直してください。
      </p>
      <div className={styles.buttons}>
        <button type="button" className={styles.primary} onClick={reset}>
          もう一度試す
        </button>
        <Link href="/" className={styles.secondary}>
          セトリに戻る
        </Link>
      </div>
      {error.digest && <small>エラー番号：{error.digest}</small>}
    </main>
  );
}
