import type { CSSProperties } from "react";
import { HomeTabBar } from "./HomeTabBar";
import home from "./home.module.css";
import styles from "./skeleton.module.css";

const ROWS = 7;
const CHIPS = [56, 72, 64, 80];

/** 行ごとに明滅をずらす（0.1s ずつ） */
const delay = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * セトリ（ホーム）の読み込み中の表示。
 * 最初の約0.8秒はアイコンが揺れる画面を重ね、そのあとセトリ風の骨組みが見える。
 * 切り替えは CSS の animation-delay だけで行う（データが先に届けば骨組みは見えずに一覧へ替わる）
 */
export function HomeSkeleton() {
  return (
    <div className={styles.root}>
      <div className={home.page}>
        <header className={home.header}>
          <div className={home.brand}>
            <svg
              width="28"
              height="28"
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
            <h1>Setlistic</h1>
          </div>
          <h1 className={home.pcTitle}>セトリ</h1>
          {/* 本物の検索欄は一覧と一緒に届くので、見た目だけ置く */}
          <div className={`${home.searchBox} ${styles.search}`} aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <span>曲名・アーティスト・タグ</span>
          </div>
        </header>

        <div role="status">
          <span className="visually-hidden">曲リストを読み込み中</span>
          <div aria-hidden="true">
            <div className={home.chips}>
              {CHIPS.map((w, i) => (
                <span
                  key={i}
                  className={`${styles.bar} ${styles.chip}`}
                  style={{ ...delay(i), width: w }}
                />
              ))}
            </div>
            <div className={home.main}>
              <section className={home.card}>
                <div className={home.cardHead}>
                  <h2>SET LIST</h2>
                  <span className={`${styles.bar} ${styles.count}`} />
                </div>
                <ol className={home.list}>
                  {Array.from({ length: ROWS }, (_, i) => (
                    <li key={i} className={styles.row}>
                      <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
                      <span className={styles.lines}>
                        <span className={`${styles.bar} ${styles.title}`} style={delay(i)} />
                        <span className={`${styles.bar} ${styles.artist}`} style={delay(i)} />
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        </div>

        <HomeTabBar searchHref="/search" />
      </div>

      <div className={styles.overlay} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- 小さな SVG をそのまま出すだけ */}
        <img src="/icon.svg" alt="" width={112} height={112} className={styles.icon} />
        <span className={styles.dots}>
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}
