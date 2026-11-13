/** 曲などの ID（UUID）。パスに入っていたら伏せる */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * アクセス解析（Vercel Web Analytics）に送る URL から、利用者や曲を特定できる部分を落とす。
 * - クエリと # 以降は送らない（`/add?url=` の曲の URL、`/auth/callback?code=` の認可コードなどが入るため）
 * - パス中の ID は `[id]` に置き換える（`/songs/{曲ID}`）
 */
export function redactAnalyticsUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // 絶対 URL でなければ、クエリと # 以降を切って使う
    return raw.split(/[?#]/)[0].replace(UUID, "[id]");
  }
  return url.origin + url.pathname.replace(UUID, "[id]");
}
