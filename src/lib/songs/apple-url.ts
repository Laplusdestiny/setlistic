export type SourceService = "apple_music" | "spotify" | "youtube_music" | "amazon_music";

export type ParseResult =
  | {
      ok: true;
      service: "apple_music";
      trackId: number;
      /** URL中の国コード（小文字）。無ければ null */
      country: string | null;
      /** 追跡パラメータを落とした `https://music.apple.com/{cc}/song/{id}` */
      canonicalUrl: string;
    }
  | {
      ok: false;
      reason: "empty" | "not_url" | "album_only" | "not_song";
    }
  | {
      ok: false;
      reason: "unsupported_service";
      service: Exclude<SourceService, "apple_music"> | null;
    };

const APPLE_HOST = /^(?:(?:embed|geo)\.)?music\.apple\.com$|^itunes\.apple\.com$/;
const COUNTRY = /^[a-z]{2}$/i;
const DIGITS = /^\d+$/;

function detectOtherService(host: string): Exclude<SourceService, "apple_music"> | null {
  if (host === "open.spotify.com" || host === "spotify.link") return "spotify";
  if (
    host === "music.youtube.com" ||
    host === "www.youtube.com" ||
    host === "youtube.com" ||
    host === "youtu.be"
  )
    return "youtube_music";
  if (/(^|\.)music\.amazon\.[a-z.]+$/.test(host) || host === "amzn.to") return "amazon_music";
  return null;
}

/**
 * 共有テキスト（URL以外の文字が混ざっていてもよい）から曲URLを読み取る純粋関数。
 * 対応: Apple Music の album?i= / song 形式。他サービスは判別だけして unsupported_service を返す。
 */
export function parseMusicUrl(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };

  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return { ok: false, reason: "not_url" };

  let url: URL;
  try {
    url = new URL(match[0]);
  } catch {
    return { ok: false, reason: "not_url" };
  }

  const host = url.hostname.toLowerCase();
  if (!APPLE_HOST.test(host)) {
    return { ok: false, reason: "unsupported_service", service: detectOtherService(host) };
  }

  // 空セグメント（末尾スラッシュ）を除いて見る
  const segments = url.pathname.split("/").filter(Boolean);
  let country: string | null = null;
  if (segments[0] && COUNTRY.test(segments[0])) {
    country = segments[0].toLowerCase();
    segments.shift();
  }

  const kind = segments[0];
  const last = segments[segments.length - 1] ?? "";

  if (kind === "song") {
    if (DIGITS.test(last)) return found(Number(last), country);
    return { ok: false, reason: "not_song" };
  }

  if (kind === "album") {
    const track = url.searchParams.get("i");
    if (track && DIGITS.test(track)) return found(Number(track), country);
    return { ok: false, reason: "album_only" };
  }

  return { ok: false, reason: "not_song" };
}

function found(trackId: number, country: string | null): ParseResult {
  return {
    ok: true,
    service: "apple_music",
    trackId,
    country,
    canonicalUrl: `https://music.apple.com/${country ?? "jp"}/song/${trackId}`,
  };
}
