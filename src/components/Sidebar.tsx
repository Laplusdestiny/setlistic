"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import styles from "./sidebar.module.css";

const ITEMS = [
  { href: "/", label: "セトリ（曲一覧）" },
  { href: "/tags", label: "タグ管理" },
  { href: "/settings", label: "設定" },
  { href: "/help", label: "ヘルプ" },
] as const;

/** PC 用の左サイドバー（スマホでは非表示。スマホはタブバーを使う） */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="メインメニュー" className={styles.sidebar}>
      <div className={styles.logo}>
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="5" y="3" width="14" height="18" rx="1.5" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
        <span>Setlistic</span>
      </div>
      {ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/" || pathname.startsWith("/songs") || pathname.startsWith("/search")
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.item}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/add"
        className={styles.add}
        aria-current={pathname.startsWith("/add") ? "page" : undefined}
      >
        ＋ 曲を登録
      </Link>
      <form action={signOut} className={styles.logout}>
        <button type="submit">ログアウト</button>
      </form>
    </nav>
  );
}

/** サイドバーの読み込み中の表示。同じ位置・同じトーンで骨組みだけを出す */
export function SidebarSkeleton() {
  return (
    <div className={styles.sidebar} aria-hidden="true">
      <span className={`${styles.bone} ${styles.boneLogo}`} />
      {ITEMS.map((item) => (
        <span key={item.href} className={styles.bone} />
      ))}
    </div>
  );
}
