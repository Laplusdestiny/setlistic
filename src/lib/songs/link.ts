import { parseMusicUrl } from "./apple-url";
import { SERVICE_LABELS } from "./services";

export type SongLink = { href: string; label: string };

type LinkSource = {
  appleUrl: string | null;
  sourceService: string | null;
  sourceUrl: string | null;
};

/**
 * 曲の画面に出す「〜で開く」リンク。Spotify / YouTube Music から登録した曲は登録元のURLを優先し、
 * それ以外は Apple Music のURLを使う。インポートでは任意のURLが入りうるので、
 * 登録元のURLは同じサービスの曲URLとして読めたときだけ使う（追跡パラメータを落とした形にそろえる）。
 */
export function songLink({ appleUrl, sourceService, sourceUrl }: LinkSource): SongLink | null {
  if ((sourceService === "spotify" || sourceService === "youtube_music") && sourceUrl) {
    const parsed = parseMusicUrl(sourceUrl);
    if (parsed.ok && parsed.service === sourceService) {
      return { href: parsed.canonicalUrl, label: `${SERVICE_LABELS[sourceService]}で開く` };
    }
  }
  return appleUrl ? { href: appleUrl, label: `${SERVICE_LABELS.apple_music}で開く` } : null;
}
