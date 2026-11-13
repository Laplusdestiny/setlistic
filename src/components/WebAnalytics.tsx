"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { redactAnalyticsUrl } from "@/lib/analytics";

/** 送る前に、URL からクエリ・ID を落とす（関数を渡すのでクライアントコンポーネントにしている） */
export const redactEvent = (event: BeforeSendEvent): BeforeSendEvent => ({
  ...event,
  url: redactAnalyticsUrl(event.url),
});

/**
 * Vercel Web Analytics（ページの表示回数の集計）。Cookie は使わない。
 * 本番のデプロイでだけ送信され、開発中は送らない。
 */
export function WebAnalytics() {
  return <Analytics beforeSend={redactEvent} />;
}
