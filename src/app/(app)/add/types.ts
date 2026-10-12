import type { Confidence } from "@/lib/songs/match";
import type { SongDraft } from "@/lib/songs/types";

export type DuplicateInfo = { id: string; title: string } | null;

export type LookupError =
  | "empty"
  | "not_url"
  | "album_only"
  | "not_song"
  | "unsupported_service"
  | "not_found"
  | "network"
  /** Spotify / YouTube への通信に失敗（HTTPエラー・タイムアウト） */
  | "source_failed"
  /** 取得できたが曲情報が見つからない */
  | "source_meta_not_found";

export type Candidate = { draft: SongDraft; duplicate: DuplicateInfo };

/** Spotify / YouTube Music の URL から取得したときの、iTunes との突き合わせ結果 */
export type ExternalInfo = {
  service: "spotify" | "youtube_music";
  confidence: Confidence;
  /** 取得元の表記のままの下書き */
  source: Candidate;
  /** 要確認のときの候補（最大3件） */
  candidates: Candidate[];
  /** iTunes Search に失敗したため、取得元の値だけで返している */
  itunesFailed: boolean;
};

export type LookupResult =
  | { status: "ok"; draft: SongDraft; duplicate: DuplicateInfo; external?: ExternalInfo }
  | { status: "error"; reason: LookupError; service?: string | null };

export type SearchResult =
  | { status: "ok"; results: (SongDraft & { duplicate: boolean })[] }
  | { status: "error"; reason: "network" | "too_short" };

export type SaveResult =
  | { status: "ok"; id: string }
  | { status: "duplicate" }
  | { status: "limit" }
  | { status: "error"; message: string };

export type BulkItem = {
  input: string;
  result: LookupResult;
  /** 同じ貼り付け内で既に出てきた曲 */
  repeated?: boolean;
};

export type BulkSaveItem = {
  title: string;
  status: "ok" | "duplicate" | "error" | "limit";
  /** 登録できた曲のID（一括変更画面へ進むため） */
  id?: string;
};

export type { GroupOption, TagOption } from "@/lib/tags/types";
