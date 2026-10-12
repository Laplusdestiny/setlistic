export type SourceService = "apple_music" | "spotify" | "youtube_music" | "amazon_music";

export type AppleParsed = {
  ok: true;
  service: "apple_music";
  trackId: number;
  /** URL中の国コード（小文字）。無ければ null */
  country: string | null;
  /** 追跡パラメータを落とした `https://music.apple.com/{cc}/song/{id}` */
  canonicalUrl: string;
};

/**
 * Spotify / YouTube Music の曲。`id` が null なのは spotify.link の短縮URLで、
 * リダイレクトを辿るまで曲IDが分からない（そのときは canonicalUrl に短縮URLそのものが入る）。
 */
export type ExternalParsed = {
  ok: true;
  service: "spotify" | "youtube_music";
  id: string | null;
  /** 追跡パラメータ（si など）を落としたURL。登録元リンクとして保存し、重複判定にも使う */
  canonicalUrl: string;
};

export type ParseResult =
  | AppleParsed
  | ExternalParsed
  | {
      ok: false;
      reason: "empty" | "not_url" | "album_only" | "not_song";
    }
  | {
      ok: false;
      reason: "unsupported_service";
      service: "amazon_music" | null;
    };

const APPLE_HOST = /^(?:(?:embed|geo)\.)?music\.apple\.com$|^itunes\.apple\.com$/;
const COUNTRY = /^[a-z]{2}$/i;
const DIGITS = /^\d+$/;

const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_SHORT = /^[A-Za-z0-9]+$/;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "music.youtube.com",
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
]);

export const spotifyTrackUrl = (id: string) => `https://open.spotify.com/track/${id}`;
export const youtubeMusicUrl = (id: string) => `https://music.youtube.com/watch?v=${id}`;

/** open.spotify.com のパスから曲IDを取り出す（`/intl-ja/track/{id}` の言語部分は読み飛ばす） */
export function spotifyTrackId(url: URL): string | null {
  if (url.hostname.toLowerCase() !== "open.spotify.com") return null;
  const seg = url.pathname.split("/").filter(Boolean);
  if (seg[0]?.startsWith("intl-")) seg.shift();
  return seg[0] === "track" && seg[1] && SPOTIFY_TRACK_ID.test(seg[1]) ? seg[1] : null;
}

function parseSpotify(url: URL, host: string): ParseResult {
  if (host === "spotify.link") {
    const seg = url.pathname.split("/").filter(Boolean);
    if (seg.length === 1 && SPOTIFY_SHORT.test(seg[0])) {
      return {
        ok: true,
        service: "spotify",
        id: null,
        canonicalUrl: `https://spotify.link/${seg[0]}`,
      };
    }
    return { ok: false, reason: "not_song" };
  }
  const id = spotifyTrackId(url);
  if (id) return { ok: true, service: "spotify", id, canonicalUrl: spotifyTrackUrl(id) };
  const seg = url.pathname.split("/").filter(Boolean);
  if (seg[0]?.startsWith("intl-")) seg.shift();
  return { ok: false, reason: seg[0] === "album" ? "album_only" : "not_song" };
}

function parseYoutube(url: URL, host: string): ParseResult {
  const id = host === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v");
  if (id && YOUTUBE_VIDEO_ID.test(id) && (host === "youtu.be" || url.pathname === "/watch")) {
    return { ok: true, service: "youtube_music", id, canonicalUrl: youtubeMusicUrl(id) };
  }
  return { ok: false, reason: url.pathname.startsWith("/browse") ? "album_only" : "not_song" };
}

/**
 * 共有テキスト（URL以外の文字が混ざっていてもよい）から曲URLを読み取る純粋関数。
 * 対応: Apple Music の album?i= / song 形式、Spotify の track（spotify.link 短縮URL含む）、
 * YouTube Music / YouTube の watch・youtu.be。Amazon Music は判別だけして unsupported_service を返す。
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
  if (host === "open.spotify.com" || host === "spotify.link") return parseSpotify(url, host);
  if (YOUTUBE_HOSTS.has(host) || host === "youtu.be") return parseYoutube(url, host);
  if (!APPLE_HOST.test(host)) {
    const amazon = /(^|\.)music\.amazon\.[a-z.]+$/.test(host) || host === "amzn.to";
    return { ok: false, reason: "unsupported_service", service: amazon ? "amazon_music" : null };
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

function found(trackId: number, country: string | null): AppleParsed {
  return {
    ok: true,
    service: "apple_music",
    trackId,
    country,
    canonicalUrl: `https://music.apple.com/${country ?? "jp"}/song/${trackId}`,
  };
}
