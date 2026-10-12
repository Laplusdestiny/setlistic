// 2026-10-12 に実際の Spotify / YouTube / iTunes Search から取得した応答（使う項目だけに削ったもの）。
// Issue #4 の検証スクリプト（playground）と同じ曲で、判定ルールの回帰確認に使う。
import itunesSearch from "./itunes-search.json";
import spotifyPages from "./spotify-pages.json";
import youtubePlayerResponses from "./youtube-player-responses.json";

export const SPOTIFY_PAGES: Record<string, string> = spotifyPages;
export const ITUNES_SEARCH: Record<string, unknown> = itunesSearch;

/** watch ページの HTML のうち、ytInitialPlayerResponse の代入部分だけを再現する */
export function watchHtml(videoId: string): string {
  const pr = (youtubePlayerResponses as Record<string, unknown>)[videoId];
  if (!pr) throw new Error(`no fixture for ${videoId}`);
  return `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(pr)};var meta = {"a":"}"};</script></body></html>`;
}
