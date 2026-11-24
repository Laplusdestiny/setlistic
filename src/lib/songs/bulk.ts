import { parseMusicUrl } from "./apple-url";

/**
 * まとめて登録で、同じ貼り付けの中の同じ曲を見分けるキー（Apple Music は国違いも同じ曲）。
 * 2回目以降は曲情報を取得せず、重複の印だけ付ける
 */
export function sameSongKey(input: string): string | null {
  const parsed = parseMusicUrl(input);
  if (!parsed.ok) return null;
  return parsed.service === "apple_music" ? `apple:${parsed.trackId}` : parsed.canonicalUrl;
}
