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

  it("未対応サービスは、知っているサービスなら名前を出す", () => {
    expect(lookupErrorMessage("unsupported_service", "spotify")).toBe(
      "Spotify のURLにはまだ対応していません。曲名で探して登録できます。",
    );
    expect(lookupErrorMessage("unsupported_service", "youtube_music")).toContain("YouTube Music");
    expect(lookupErrorMessage("unsupported_service", "unknown")).toContain("対応していないURLです");
    expect(lookupErrorMessage("unsupported_service", null)).toContain("対応していないURLです");
  });
});
