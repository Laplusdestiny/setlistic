import type { SourceService } from "./apple-url";

// URL から登録できる音楽サービス（表示名）。parseMusicUrl が曲として読めるもの。
// 登録画面・チュートリアル・ヘルプの「対応サービス」はここから作る。
export const SUPPORTED_SERVICE_NAMES = ["Apple Music", "Spotify", "YouTube Music"] as const;

/** 「Apple Music・Spotify・YouTube Music」 */
export const supportedServicesText = () => SUPPORTED_SERVICE_NAMES.join("・");

/** 登録元サービスの表示名（曲の画面の「〜で開く」に使う） */
export const SERVICE_LABELS: Record<Exclude<SourceService, "amazon_music">, string> = {
  apple_music: "Apple Music",
  spotify: "Spotify",
  youtube_music: "YouTube Music",
};
