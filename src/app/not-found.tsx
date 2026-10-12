import type { Metadata } from "next";
import Link from "next/link";
import styles from "./status.module.css";

export const metadata: Metadata = { title: "ページが見つかりません" };

export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1>ページが見つかりません</h1>
      <p>URLが違うか、削除された曲・ページかもしれません。</p>
      <div className={styles.buttons}>
        <Link href="/" className={styles.primary}>
          セトリに戻る
        </Link>
      </div>
    </main>
  );
}
