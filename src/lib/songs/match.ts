import type { SongDraft } from "./types";

/**
 * Spotify / YouTube Music から取った曲情報を、iTunes Search の候補と突き合わせる純粋関数群。
 * 判定は合計点ではなくシグナルの組み合わせで行い、点数は同じ判定の中での順位付けにだけ使う。
 */

/** 他サービスから取得した曲情報（取得元の表記のまま） */
export type SourceSong = {
  service: "spotify" | "youtube_music";
  method: "ogp" | "data_api" | "watch_html" | "oembed";
  /** Spotify のトラックID / YouTube の動画ID */
  id: string;
  /** 追跡パラメータを落としたURL（登録元リンク） */
  url: string;
  title: string;
  /** メインアーティスト。「Various Artists - Topic」などで分からなければ null */
  artist: string | null;
  /** feat. の相手や作詞・作曲などメイン以外の名前（重複なし） */
  credits: string[];
  album: string | null;
  /** YYYY-MM-DD */
  releaseDate: string | null;
  durationSec: number | null;
};

export type Confidence = "confident" | "needs_confirmation" | "not_found";

export type Signals = {
  title: "exact" | "partial" | null;
  artist: "exact" | "partial" | null;
  /** 長さの差。1秒以内 / 3秒以内（別バージョンの可能性） */
  duration: "within1" | "within3" | null;
  release: boolean;
  /** feat. を含めた曲名でも一致（同点時の区別用） */
  fullTitle: boolean;
};

/** 比較用：NFKC → 小文字化 → 空白・記号を除く（例: `1,000,000 TIMES` → `1000000times`） */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// 直前が空白か括弧のときだけ feat. とみなす（「Defeat. …」の途中で切らない）
const FEAT = /\s*(?:[([（【]\s*|\s)(?:feat\.?|ft\.?|featuring)\s.*$/i;

/** 芯の曲名：feat. / ft. / featuring 以降（括弧付きも含む）を除く */
export function coreTitle(s: string | null | undefined): string {
  return (s ?? "").replace(FEAT, "").trim();
}

const containsEither = (a: string, b: string) =>
  Boolean(a && b) && (a.includes(b) || b.includes(a));

export function signals(cand: SongDraft, src: SourceSong): Signals {
  const ct = norm(coreTitle(cand.title));
  const st = norm(coreTitle(src.title));
  const ca = norm(cand.artist);
  const sa = norm(src.artist);

  let duration: Signals["duration"] = null;
  if (src.durationSec != null && cand.durationMs != null) {
    const diff = Math.abs(cand.durationMs / 1000 - src.durationSec);
    if (diff <= 1) duration = "within1";
    else if (diff <= 3) duration = "within3";
  }

  return {
    title: ct && ct === st ? "exact" : containsEither(ct, st) ? "partial" : null,
    artist: ca && ca === sa ? "exact" : containsEither(ca, sa) ? "partial" : null,
    duration,
    release: Boolean(src.releaseDate && cand.releaseDate === src.releaseDate),
    fullTitle: Boolean(norm(cand.title)) && norm(cand.title) === norm(src.title),
  };
}

/** 同じ判定の中での順位付けに使う点数（検証スクリプトと同じ配点） */
export function score(s: Signals): number {
  return (
    (s.title === "exact" ? 50 : s.title === "partial" ? 20 : 0) +
    (s.artist === "exact" ? 30 : s.artist === "partial" ? 20 : 0) +
    (s.duration === "within1" ? 20 : s.duration === "within3" ? 10 : 0) +
    (s.fullTitle ? 10 : 0) +
    (s.release ? 5 : 0)
  );
}

/**
 * - 確信あり：曲名一致 かつ（アーティスト一致 または 長さ±1秒とリリース日の両方一致）
 * - 要確認：上記以外で、曲名・アーティスト・長さのうち2つ以上が一致
 * - 見つからず：それ以外（曲名だけの一致＝カバー曲などは採用しない）
 */
export function judge(s: Signals): Confidence {
  const durationMatch = s.duration === "within1";
  if (s.title === "exact" && (s.artist !== null || (durationMatch && s.release))) {
    return "confident";
  }
  const hits = [s.title !== null, s.artist !== null, durationMatch].filter(Boolean).length;
  return hits >= 2 ? "needs_confirmation" : "not_found";
}

export type Ranked = { draft: SongDraft; confidence: Confidence; score: number };

const ORDER: Record<Confidence, number> = { confident: 0, needs_confirmation: 1, not_found: 2 };

/** 候補を「判定 → 点数」の順に並べる。同じ曲（trackId）は1件にまとめる */
export function rank(candidates: SongDraft[], src: SourceSong): Ranked[] {
  const seen = new Set<number>();
  const out: Ranked[] = [];
  for (const draft of candidates) {
    if (draft.appleTrackId != null) {
      if (seen.has(draft.appleTrackId)) continue;
      seen.add(draft.appleTrackId);
    }
    const s = signals(draft, src);
    out.push({ draft, confidence: judge(s), score: score(s) });
  }
  // sort は安定なので、同点なら iTunes の並び順を保つ
  return out.sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence] || b.score - a.score);
}

/** 検索語：①「芯の曲名＋メインアーティスト」②「芯の曲名のみ」（アーティスト不明なら②だけ） */
export function searchTerms(src: SourceSong): string[] {
  const title = coreTitle(src.title) || src.title;
  const terms = src.artist ? [`${title} ${src.artist}`, title] : [title];
  return terms.map((t) => t.trim()).filter(Boolean);
}
