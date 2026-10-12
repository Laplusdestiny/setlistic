import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "./login/actions";

// Phase 3 でセトリ一覧に置き換える。ログインしていないと proxy が /login へ送る。
export default function Home() {
  return (
    <main style={{ padding: "48px 16px", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Setlistic</h1>
      <p style={{ color: "var(--color-ink-muted)", fontFamily: "var(--font-hand)", fontSize: 18 }}>
        SET LIST
      </p>
      <p style={{ color: "var(--color-ink-muted)" }}>
        ログインできました。曲の登録はこれから作ります。
      </p>
      <p>
        <Link
          href="/add"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            padding: "0 20px",
            borderRadius: "var(--radius-control)",
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ＋ 曲を登録
        </Link>
      </p>
      <Suspense fallback={null}>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              minHeight: 44,
              padding: "0 20px",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-control)",
              background: "var(--color-paper)",
              color: "var(--color-ink)",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </form>
      </Suspense>
    </main>
  );
}
