import type { SongDraft } from "./types";

// iTunes API の応答のうち使う項目だけ。previewUrl（試聴音源）は型にも持たず、使わない。
type ItunesTrack = {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  trackViewUrl?: string;
};

type ItunesResponse = { resultCount?: number; results?: unknown };

function isSong(
  r: unknown,
): r is ItunesTrack & { trackId: number; trackName: string; artistName: string } {
  if (typeof r !== "object" || r === null) return false;
  const t = r as ItunesTrack;
  return (
    t.kind === "song" &&
    typeof t.trackId === "number" &&
    typeof t.trackName === "string" &&
    t.trackName.length > 0 &&
    typeof t.artistName === "string"
  );
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** 追跡用の uo パラメータを落とす */
function cleanAppleUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.searchParams.delete("uo");
    return u.toString();
  } catch {
    return null;
  }
}

function toDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function toSongDraft(
  t: ItunesTrack & { trackId: number; trackName: string; artistName: string },
  source: { service: "apple_music" | "search"; url: string | null },
): SongDraft {
  return {
    appleTrackId: t.trackId,
    title: t.trackName,
    artist: t.artistName,
    album: str(t.collectionName),
    genre: str(t.primaryGenreName),
    artworkUrl: str(t.artworkUrl100),
    durationMs: typeof t.trackTimeMillis === "number" ? t.trackTimeMillis : null,
    releaseDate: toDate(t.releaseDate),
    appleUrl: cleanAppleUrl(t.trackViewUrl),
    sourceService: source.service,
    sourceUrl: source.url,
  };
}

/** Lookup の応答から曲を1件取り出す（見つからなければ null） */
export function mapLookupResponse(body: unknown, sourceUrl: string | null): SongDraft | null {
  const results = (body as ItunesResponse | null)?.results;
  if (!Array.isArray(results)) return null;
  const track = results.find(isSong);
  return track ? toSongDraft(track, { service: "apple_music", url: sourceUrl }) : null;
}

/** Search の応答を曲の一覧にする */
export function mapSearchResponse(body: unknown): SongDraft[] {
  const results = (body as ItunesResponse | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.filter(isSong).map((t) => toSongDraft(t, { service: "search", url: null }));
}

// ───────── 通信（サーバー側のみ。登録時にだけ呼ぶ） ─────────

const BASE = "https://itunes.apple.com";
const TIMEOUT_MS = 8000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`iTunes API ${res.status}`);
  // Content-Type が text/javascript で返ることがあるので text() から parse する
  return JSON.parse(await res.text());
}

/** 曲IDで取得。指定の国で見つからなければ jp にフォールバックする */
export async function lookupTrack(
  trackId: number,
  country: string | null,
  sourceUrl: string,
): Promise<SongDraft | null> {
  const countries = [...new Set([country ?? "jp", "jp"])];
  for (const c of countries) {
    const body = await getJson(
      `${BASE}/lookup?id=${trackId}&country=${encodeURIComponent(c)}&entity=song`,
    );
    const draft = mapLookupResponse(body, sourceUrl);
    if (draft) return draft;
  }
  return null;
}

export async function searchTracks(term: string, limit = 10): Promise<SongDraft[]> {
  const q = new URLSearchParams({
    term,
    country: "jp",
    media: "music",
    entity: "song",
    limit: String(limit),
    lang: "ja_jp",
  });
  return mapSearchResponse(await getJson(`${BASE}/search?${q}`));
}
