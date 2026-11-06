import { parseMusicUrl } from "./apple-url";
import { SERVICE_LABELS } from "./services";

export type SongLink = { href: string; label: string };

type LinkSource = {
  appleUrl: string | null;
  sourceService: string | null;
  sourceUrl: string | null;
};

const LINK_SERVICES = ["apple_music", "spotify", "youtube_music"] as const;
type LinkService = (typeof LINK_SERVICES)[number];

const isLinkService = (s: string | null): s is LinkService => LINK_SERVICES.some((x) => x === s);

/**
 * 曲の画面に出す「〜で開く」リンク。登録元の URL（登録時に貼った URL、または編集で変えた URL）を優先し、
 * 無ければ Apple Music の URL を使う。インポートでは任意の URL が入りうるので、
 * 登録元の URL は同じサービスの曲 URL として読めたときだけ使う（追跡パラメータを落とした形にそろえる）。
 */
export function songLink({ appleUrl, sourceService, sourceUrl }: LinkSource): SongLink | null {
  if (isLinkService(sourceService) && sourceUrl) {
    const parsed = parseMusicUrl(sourceUrl);
    if (parsed.ok && parsed.service === sourceService) {
      return { href: parsed.canonicalUrl, label: `${SERVICE_LABELS[sourceService]}で開く` };
    }
  }
  return appleUrl ? { href: appleUrl, label: `${SERVICE_LABELS.apple_music}で開く` } : null;
}
