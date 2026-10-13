import Link from "next/link";
import styles from "./home.module.css";

/** スマホのタブバー（PC では非表示）。セトリ画面と、その読み込み中の表示で共通に使う */
export function HomeTabBar({ searchHref }: { searchHref: string }) {
  return (
    <nav className={styles.tabbar} aria-label="メインメニュー">
      <div className={styles.tabGroup}>
        <Link href="/" aria-current="page">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="5" y="3" width="14" height="18" rx="1.5" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
          セトリ
        </Link>
        <Link href={searchHref}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          検索
        </Link>
      </div>
      <Link href="/add" className={styles.fab} aria-label="曲を登録">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
      <div className={styles.tabGroup}>
        <Link href="/tags">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 12V4h8l10 10-8 8z" />
            <circle cx="7.5" cy="8.5" r="1.3" />
          </svg>
          タグ
        </Link>
        <Link href="/settings">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
          </svg>
          設定
        </Link>
      </div>
    </nav>
  );
}
