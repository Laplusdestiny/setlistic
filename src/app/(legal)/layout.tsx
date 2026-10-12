import Link from "next/link";
import styles from "./legal.module.css";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <p className={styles.draft} role="note">
        ※この文面は準備中の草案です。公開前に内容を見直します。
      </p>
      <article className={styles.article}>{children}</article>
      <p className={styles.back}>
        <Link href="/">Setlistic に戻る</Link>
      </p>
    </div>
  );
}
