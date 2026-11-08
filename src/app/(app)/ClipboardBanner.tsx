"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { extractSharedUrl } from "@/lib/songs/shared-url";
import styles from "./clipboardBanner.module.css";

// iPhone のショートカットは URL をクリップボードにコピーしてから `webapp://` でアプリを開く。
// iOS はそのとき渡したパスを使わない（ホームか前回の画面が開く）ため、前面に来たときに帯を出し、
// 押したらクリップボードの URL を入れた登録画面へ移る。開いたのがショートカットからかは分からない

/** 帯を出しておく時間 */
const SHOW_MS = 8000;

const noSubscribe = () => () => {};

/** iPhone・iPad のホーム画面から起動しているか（Android は共有メニューから直接開けるので対象外） */
const isIosStandalone = () => (window.navigator as { standalone?: boolean }).standalone === true;

export function ClipboardBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const enabled = useSyncExternalStore(noSubscribe, isIosStandalone, () => false);
  // 前面に来るたびに増やし、帯を出し直す
  const [shownAt, setShownAt] = useState(0);
  const [open, setOpen] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setShownAt((n) => n + 1);
      setOpen(true);
      setNotFound(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!open || notFound) return;
    const timer = setTimeout(() => setOpen(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [open, notFound, shownAt]);

  // 登録画面には「ペースト」ボタンがあるので出さない
  if (!enabled || !open || pathname.startsWith("/add")) return null;

  async function pasteAndAdd() {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // 貼り付けを許可しなかったときは何もしない
      return;
    }
    const url = extractSharedUrl({ text });
    if (!url) {
      setNotFound(true);
      return;
    }
    setOpen(false);
    router.push(`/add?url=${encodeURIComponent(url)}`);
  }

  return (
    <aside className={styles.banner} aria-label="コピーしたURLから登録">
      <button type="button" className={styles.action} onClick={pasteAndAdd}>
        コピーしたURLから登録
      </button>
      <button
        type="button"
        className={styles.close}
        aria-label="閉じる"
        onClick={() => setOpen(false)}
      >
        ×
      </button>
      {notFound && (
        <p role="status" className={styles.note}>
          コピーした中にURLがありません
        </p>
      )}
    </aside>
  );
}
