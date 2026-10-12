import { describe, expect, it } from "vitest";
import { lookupErrorMessage } from "./messages";
import type { LookupError } from "./types";

describe("lookupErrorMessage", () => {
  it.each<[LookupError, string]>([
    ["empty", "URLを貼り付けてください"],
    ["not_url", "URLが見つかりませんでした"],
    ["album_only", "アルバムのURL"],
    ["not_song", "曲のURLではない"],
    ["not_found", "曲が見つかりませんでした"],
    ["network", "通信に失敗しました"],
  ])("%s", (reason, text) => {
    expect(lookupErrorMessage(reason)).toContain(text);
  });

  it("取得元の失敗は、サービス名を添える（不明なら「共有元のサービス」）", () => {
    expect(lookupErrorMessage("source_failed", "spotify")).toBe(
      "Spotifyから曲情報を取得できませんでした。時間をおいてもう一度お試しいただくか、曲名で探してください。",
    );
    expect(lookupErrorMessage("source_meta_not_found", "youtube_music")).toContain(
      "YouTube Musicのページから曲情報を読み取れませんでした",
    );
    expect(lookupErrorMessage("source_failed", null)).toContain("共有元のサービスから");
    expect(lookupErrorMessage("source_meta_not_found")).toContain("共有元のサービスのページ");
  });

  it("未対応サービスは、知っているサービスなら名前を出す", () => {
    expect(lookupErrorMessage("unsupported_service", "spotify")).toBe(
      "Spotify のURLにはまだ対応していません。曲名で探して登録できます。",
    );
    expect(lookupErrorMessage("unsupported_service", "amazon_music")).toContain("Amazon Music");
    expect(lookupErrorMessage("unsupported_service", "unknown")).toContain("対応していないURLです");
    expect(lookupErrorMessage("unsupported_service", null)).toContain("対応していないURLです");
  });
});
