import type { LookupError } from "./types";

export const SERVICE_NAMES: Record<string, string> = {
  spotify: "Spotify",
  youtube_music: "YouTube Music",
  amazon_music: "Amazon Music",
};

export function lookupErrorMessage(reason: LookupError, service?: string | null): string {
  switch (reason) {
    case "empty":
      return "URLを貼り付けてください。";
    case "not_url":
      return "URLが見つかりませんでした。音楽アプリの「共有 → リンクをコピー」で取得したURLを貼り付けてください。";
    case "album_only":
      return "アルバムのURLのようです。曲を選んで「共有 → リンクをコピー」したURLを貼り付けてください。";
    case "not_song":
      return "曲のURLではないようです。曲の共有URLを貼り付けてください。";
    case "unsupported_service":
      return service && SERVICE_NAMES[service]
        ? `${SERVICE_NAMES[service]} のURLにはまだ対応していません。曲名で探して登録できます。`
        : "対応していないURLです。Apple Music・Spotify・YouTube Music の曲URLを貼り付けるか、曲名で探してください。";
    case "not_found":
      return "曲が見つかりませんでした。曲名で探すか、手入力で登録できます。";
    case "network":
      return "通信に失敗しました。時間をおいてもう一度お試しください。";
    case "source_failed":
      return `${serviceName(service)}から曲情報を取得できませんでした。時間をおいてもう一度お試しいただくか、曲名で探してください。`;
    case "source_meta_not_found":
      return `${serviceName(service)}のページから曲情報を読み取れませんでした。曲名で探すか、手入力で登録できます。`;
  }
}

const serviceName = (service?: string | null) =>
  (service && SERVICE_NAMES[service]) ?? "共有元のサービス";
