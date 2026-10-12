import type { SourceService } from "./apple-url";

/** 登録フォームに渡す曲情報。DBの songs 列に対応する（previewUrl は持たない） */
export type SongDraft = {
  appleTrackId: number | null;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  /** 文字列のみ保存。MVPでは表示しない */
  artworkUrl: string | null;
  durationMs: number | null;
  /** YYYY-MM-DD */
  releaseDate: string | null;
  appleUrl: string | null;
  sourceService: SourceService | "manual" | "search";
  sourceUrl: string | null;
};
