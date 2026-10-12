import type { SongDraft } from "@/lib/songs/types";

export type DuplicateInfo = { id: string; title: string } | null;

export type LookupError =
  "empty" | "not_url" | "album_only" | "not_song" | "unsupported_service" | "not_found" | "network";

export type LookupResult =
  | { status: "ok"; draft: SongDraft; duplicate: DuplicateInfo }
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
