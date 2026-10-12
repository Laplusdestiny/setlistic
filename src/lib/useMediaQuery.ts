"use client";

import { useSyncExternalStore } from "react";

/** CSS のメディアクエリに一致するか。サーバー描画・ハイドレーション時は false */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
