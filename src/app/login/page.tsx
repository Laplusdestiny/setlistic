import type { Metadata } from "next";
import { Suspense } from "react";
import { signInWithGoogle } from "./actions";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "ログイン" };

const ERRORS: Record<string, string> = {
  denied: "このGoogleアカウントでは利用できません。Setlisticは招待制です。",
  failed: "ログインできませんでした。もう一度お試しください。",
};

async function LoginForm({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { error, next } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.failed) : null;

  return (
    <form action={signInWithGoogle} className={styles.form}>
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
      </div>

      <Suspense fallback={<div className={styles.form} aria-busy="true" />}>
        <LoginForm searchParams={searchParams} />
      </Suspense>

      <p className={styles.terms}>
        続行すると利用規約とプライバシーポリシーに同意したものとみなされます
      </p>
    </main>
  );
}
