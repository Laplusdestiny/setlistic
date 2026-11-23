"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";

// タブバーの左端。いちばん上にいるときは「セトリ」、下へスクロールしているあいだは「上へ」（Issue #62）

/** これより下がったら「上へ」にする。iPhone の引っ張りの揺れで行ったり来たりしないよう少し余裕を持たせる */
const THRESHOLD = 24;

const subscribe = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
};
const isScrolled = () => window.scrollY > THRESHOLD;

export function SetlistTab() {
  const scrolled = useSyncExternalStore(subscribe, isScrolled, () => false);
  const link = useRef<HTMLAnchorElement>(null);
  // 「上へ」で戻ったら「セトリ」に替わってボタンが消えるので、押した人のフォーカスをリンクへ移す
  const returning = useRef(false);

  useEffect(() => {
    if (scrolled || !returning.current) return;
    returning.current = false;
    link.current?.focus();
  }, [scrolled]);

  if (scrolled) {
    return (
      <button
        type="button"
        aria-label="いちばん上へ戻る"
        onClick={() => {
          returning.current = true;
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          // 検索・絞り込みの条件は URL のまま残す（「セトリ」のリンクと違って外さない）
          window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        }}
      >
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
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        上へ
      </button>
    );
  }

  return (
    <Link ref={link} href="/" aria-current="page">
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
  );
}
