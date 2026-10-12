import type { ExternalParsed } from "./apple-url";
import { searchTracks } from "./itunes";
import { rank, searchTerms, type Confidence, type SourceSong } from "./match";
import { fetchSpotify } from "./spotify";
import type { SongDraft } from "./types";
import { fetchYoutube } from "./youtube";

/**
 * Spotify / YouTube Music の共有URL → 取得元の曲情報 → iTunes Search で Apple Music の表記にそろえる。
 * 曲データの基準は Apple Music のカタログに統一し、他サービスの値は検索のヒントと、見つからないときの下書きに使う。
 */

export const MAX_CANDIDATES = 3;

export type ExternalMatch = {
  confidence: Confidence;
  source: SourceSong;
  /** 取得元の値で作った下書き（見つからないとき・手入力に切り替えるとき用） */
  sourceDraft: SongDraft;
  /** confident のときの一致した曲 */
  best: SongDraft | null;
  /** needs_confirmation のときの候補（最大3件） */
  candidates: SongDraft[];
  /** iTunes Search に失敗した（取得元の値だけで not_found として返している） */
  itunesFailed: boolean;
};

type Search = (term: string) => Promise<SongDraft[]>;

export function sourceToDraft(src: SourceSong): SongDraft {
  return {
    appleTrackId: null,
    title: src.title,
    artist: src.artist ?? "",
    album: src.album,
    genre: null,
    artworkUrl: null,
    durationMs: src.durationSec != null ? src.durationSec * 1000 : null,
    releaseDate: src.releaseDate,
    appleUrl: null,
    sourceService: src.service,
    sourceUrl: src.url,
  };
}

/** iTunes の候補を、登録元（Spotify / YouTube Music）の下書きにする */
const withSource = (d: SongDraft, src: SourceSong): SongDraft => ({
  ...d,
  sourceService: src.service,
  sourceUrl: src.url,
});

/**
 * ①「芯の曲名＋メインアーティスト」で検索し、要確認以上の候補が無ければ ②「芯の曲名のみ」で検索する。
 * iTunes Search は約20回/分が目安なので、1曲あたり最大2回にとどめる。
 */
export async function matchSource(src: SourceSong, search: Search): Promise<ExternalMatch> {
  const sourceDraft = sourceToDraft(src);
  const pool: SongDraft[] = [];
  try {
    for (const term of searchTerms(src)) {
      pool.push(...(await search(term)));
      if (rank(pool, src).some((r) => r.confidence !== "not_found")) break;
    }
  } catch (e) {
    console.warn(`[resolve] iTunes search failed: ${(e as Error).message}`);
    return {
      confidence: "not_found",
      source: src,
      sourceDraft,
      best: null,
      candidates: [],
      itunesFailed: true,
    };
  }

  const ranked = rank(pool, src);
  const top = ranked[0];
  const confidence = top?.confidence ?? "not_found";
  return {
    confidence,
    source: src,
    sourceDraft,
    best: confidence === "confident" ? withSource(top.draft, src) : null,
    candidates:
      confidence === "needs_confirmation"
        ? ranked
            .filter((r) => r.confidence !== "not_found")
            .slice(0, MAX_CANDIDATES)
            .map((r) => withSource(r.draft, src))
        : [],
    itunesFailed: false,
  };
}

export function fetchSource(parsed: ExternalParsed): Promise<SourceSong> {
  if (parsed.service === "spotify") return fetchSpotify(parsed.id, parsed.canonicalUrl);
  // YouTube の動画IDは URL 判定の時点で必ず決まっている
  return fetchYoutube(parsed.id!);
}

/** URL 判定済みの Spotify / YouTube Music の曲を解決する。取得元の失敗は SourceError で投げる */
export async function resolveExternal(parsed: ExternalParsed): Promise<ExternalMatch> {
  const src = await fetchSource(parsed);
  return matchSource(src, (term) => searchTracks(term));
}
