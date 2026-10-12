import { parse } from "node-html-parser";
import { spotifyTrackId, spotifyTrackUrl } from "./apple-url";
import type { SourceSong } from "./match";
import { SourceError, fetchText } from "./source-fetch";

/**
 * Spotify の曲ページの OGP（meta タグ）から曲情報を読む。
 * Web API は開発者の Premium 契約が要り、oEmbed は曲名しか返らないため使わない。
 */

type Meta = Map<string, string[]>;

function readMeta(html: string): { meta: Meta; canonical: string | null } {
  const root = parse(html);
  const meta: Meta = new Map();
  for (const el of root.querySelectorAll("meta")) {
    const key = el.getAttribute("property") ?? el.getAttribute("name");
    const content = el.getAttribute("content");
    if (!key || content == null) continue;
    meta.set(key, [...(meta.get(key) ?? []), content]);
  }
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
  return { meta, canonical };
}

const first = (meta: Meta, key: string) => meta.get(key)?.[0]?.trim() || null;

function idFromUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return spotifyTrackId(new URL(raw));
  } catch {
    return null;
  }
}

/**
 * 曲ページの HTML を SourceSong にする。曲名かアーティストが無ければ null。
 * - 曲名は og:title をそのまま使う（「ピースサイン - Peace Sign」のように「 - 」も曲名の一部）
 * - アーティストは music:musician_description。複数人なら「A, B」の1つのタグで来るので、
 *   music:musician（アーティストページのURL）が2つ以上あるときだけ「, 」で分ける
 */
export function parseSpotifyHtml(
  html: string,
  fallbackId: string | null = null,
): SourceSong | null {
  const { meta, canonical } = readMeta(html);
  const title = first(meta, "og:title");
  const description = first(meta, "music:musician_description");
  if (!title || !description) return null;

  const id = idFromUrl(canonical) ?? idFromUrl(first(meta, "og:url")) ?? fallbackId;
  if (!id) return null;

  const multiple = (meta.get("music:musician")?.length ?? 0) > 1;
  const names = multiple ? description.split(", ").map((s) => s.trim()) : [description];
  const [artist, ...rest] = names;

  // og:description は「アーティスト · アルバム · 曲 · 年」。アルバム名に「 · 」が入っても崩れないよう先頭と末尾2つを除く
  const parts = first(meta, "og:description")?.split(" · ") ?? [];
  const album = parts.length >= 4 ? parts.slice(1, -2).join(" · ") : null;

  const release = first(meta, "music:release_date");
  const duration = first(meta, "music:duration");

  return {
    service: "spotify",
    method: "ogp",
    id,
    url: spotifyTrackUrl(id),
    title,
    artist,
    credits: [...new Set(rest.filter((n) => n && n !== artist))],
    album: album || null,
    releaseDate: release && /^\d{4}-\d{2}-\d{2}$/.test(release) ? release : null,
    durationSec: duration && /^\d+$/.test(duration) ? Number(duration) : null,
  };
}

/** 曲ページ（spotify.link の短縮URLならリダイレクト先）を取得して読む */
export async function fetchSpotify(id: string | null, url: string): Promise<SourceSong> {
  const target = id ? spotifyTrackUrl(id) : url;
  const { finalUrl, body } = await fetchText(target);

  const resolvedId = id ?? idFromUrl(finalUrl);
  if (!id && !resolvedId) {
    // 短縮URLの展開先が曲ではなかった（アルバム・プレイリストなど）
    throw new SourceError("unsupported_url", `spotify.link resolved to ${finalUrl}`);
  }

  const song = parseSpotifyHtml(body, resolvedId);
  if (!song) {
    throw new SourceError("meta_not_found", `Spotify meta not found (${body.length} bytes)`);
  }
  return song;
}
