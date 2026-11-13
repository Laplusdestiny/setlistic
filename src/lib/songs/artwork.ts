import { parseMusicUrl } from "./apple-url";

/** 曲の画面に出すジャケット画像と、そのそばに置く Apple Music バッジのリンク先 */
export type SongArtwork = {
  /** Apple の画像サーバーの URL。画像は保存せず、この URL を直接読み込む */
  src: string;
  /** バッジのリンク先（追跡パラメータを落とした Apple Music の曲 URL） */
  href: string;
  trackId: number;
};

type ArtworkSource = { artworkUrl: string | null; appleUrl: string | null };

/** iTunes の API が返す画像 URL の末尾（例：`/100x100bb.jpg`）。数字を変えると大きさが変わる */
const SIZE_SUFFIX = /\/\d+x\d+bb\.(jpg|png|webp)$/;
/** 表示は 144px。高精細な画面でもぼやけない大きさで読み込む */
const SIZE = 300;

function appleImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".mzstatic.com")) return null;
  return url.toString().replace(SIZE_SUFFIX, `/${SIZE}x${SIZE}bb.$1`);
}

/**
 * ジャケット画像を出せる曲なら、画像とバッジのリンク先を返す。
 * iTunes Search API の規約で、画像は Apple のバッジ（その曲へのリンク）のそばに置く必要があるので、
 * Apple の画像 URL と Apple Music の曲 URL の両方がそろった曲だけを対象にする。
 * 登録リクエストやインポートでは任意の URL が入りうるため、Apple の画像サーバー以外の URL は出さない。
 */
export function songArtwork({ artworkUrl, appleUrl }: ArtworkSource): SongArtwork | null {
  const src = appleImageUrl(artworkUrl);
  if (!src || !appleUrl) return null;
  const parsed = parseMusicUrl(appleUrl);
  if (!parsed.ok || parsed.service !== "apple_music") return null;
  return { src, href: parsed.canonicalUrl, trackId: parsed.trackId };
}

/** 「〜で開く」のリンクがバッジと同じ曲を開くか（同じなら、バッジだけを出す） */
export function opensSameTrack(linkHref: string, artwork: SongArtwork): boolean {
  const parsed = parseMusicUrl(linkHref);
  return parsed.ok && parsed.service === "apple_music" && parsed.trackId === artwork.trackId;
}
