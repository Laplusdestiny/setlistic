import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signInWithGoogle } from "./actions";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "ログイン" };

const ERRORS: Record<string, string> = {
  denied: "このGoogleアカウントでは利用できません。Setlisticは招待制です。",
  failed: "ログインできませんでした。もう一度お試しください。",
};

async function LoginForm({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { error, next, deleted } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.failed) : null;

  return (
    <form action={signInWithGoogle} className={styles.form}>
      {deleted === "1" && (
        <p role="status" className={styles.notice}>
          アカウントと、すべてのデータを削除しました。
        </p>
      )}
      {message && (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      )}
      <input type="hidden" name="next" value={next ?? "/"} />
      <button type="submit" className={styles.google}>
        Googleでサインイン
      </button>
    </form>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.paper} aria-hidden="true">
          <span className={styles.paperLabel}>SET LIST</span>
          {[80, 65, 90, 55, 72].map((w) => (
            <span key={w} className={styles.line} style={{ width: `${w}%` }} />
          ))}
        </div>
        <h1 className={styles.title}>Setlistic</h1>
        <p className={styles.tagline}>歌える曲を、自分だけのセトリに。</p>
        <p className={styles.invite}>
          <strong>招待制</strong>
          <span>
            <span className={styles.phrase}>招待された方の</span>
            <span className={styles.phrase}>Googleアカウントだけが</span>
            <span className={styles.phrase}>ログインできます。</span>
          </span>
        </p>
      </div>

      <Suspense fallback={<div className={styles.form} aria-busy="true" />}>
        <LoginForm searchParams={searchParams} />
      </Suspense>

      <p className={styles.terms}>
        <span className={styles.phrase}>
          続行すると <Link href="/terms">利用規約</Link> と
        </span>{" "}
        <span className={styles.phrase}>
          <Link href="/privacy">プライバシーポリシー</Link> に
        </span>
        <span className={styles.phrase}>同意したものとみなされます</span>
      </p>
    </main>
  );
}
