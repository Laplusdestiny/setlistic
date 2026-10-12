"use client";

import { useEffect } from "react";
import "./globals.css";
import styles from "./status.module.css";

/** ルートレイアウト自体が失敗したときの最後の砦 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <main className={styles.page}>
          <h1>うまく表示できませんでした</h1>
          <p>一時的な問題かもしれません。もう一度お試しください。</p>
          <div className={styles.buttons}>
            <button type="button" className={styles.primary} onClick={reset}>
              もう一度試す
            </button>
          </div>
          {error.digest && <small>エラー番号：{error.digest}</small>}
        </main>
      </body>
    </html>
  );
}
