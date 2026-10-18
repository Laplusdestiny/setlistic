/** Spotify / YouTube から曲情報を取るときの通信（サーバー側のみ。登録時にだけ呼ぶ） */

import { SITE_ORIGIN } from "@/lib/site";

// ブラウザの UA だと Spotify は meta タグのない約1KBのページを返す。他社クローラーを名乗らず、自前の UA を使う
export const USER_AGENT = `Setlistic/0.1 (+${SITE_ORIGIN})`;
const TIMEOUT_MS = 8000;

export type SourceErrorCode = "unsupported_url" | "fetch_failed" | "meta_not_found";

export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export async function fetchText(url: string): Promise<{ finalUrl: string; body: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new SourceError("fetch_failed", `${new URL(url).host}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new SourceError("fetch_failed", `${new URL(url).host}: HTTP ${res.status}`);
  return { finalUrl: res.url || url, body: await res.text() };
}

export async function fetchJson(url: string): Promise<unknown> {
  const { body } = await fetchText(url);
  try {
    return JSON.parse(body);
  } catch {
    throw new SourceError("meta_not_found", `${new URL(url).host}: invalid JSON`);
  }
}
