// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isListHref, rememberSongReturn, songReturnHref } from "./return-to";

beforeEach(() => sessionStorage.clear());

describe("isListHref", () => {
  it.each(["/", "/?q=yoru", "/?tags=a&sort=title_asc"])("セトリの URL（%s）は通す", (href) => {
    expect(isListHref(href)).toBe(true);
  });

  it.each(["/search", "/songs/1", "//evil.example/", "https://evil.example/", "", "?q=x"])(
    "それ以外（%s）は通さない",
    (href) => {
      expect(isListHref(href)).toBe(false);
    },
  );
});

describe("rememberSongReturn / songReturnHref", () => {
  it("覚えた曲なら、開いたときの一覧の URL を返す", () => {
    rememberSongReturn("s1", "/?q=yoru");
    expect(songReturnHref("s1")).toBe("/?q=yoru");
  });

  it("別の曲なら null（登録直後などに古い記録を使わない）", () => {
    rememberSongReturn("s1", "/?q=yoru");
    expect(songReturnHref("s2")).toBeNull();
  });

  it("セトリ以外の URL は覚えない", () => {
    rememberSongReturn("s1", "/search?q=yoru");
    expect(songReturnHref("s1")).toBeNull();
  });

  it("何も覚えていない・壊れた値・読めないときは null", () => {
    expect(songReturnHref("s1")).toBeNull();
    sessionStorage.setItem("setlistic:song-return", "{bad json");
    expect(songReturnHref("s1")).toBeNull();
    sessionStorage.setItem(
      "setlistic:song-return",
      JSON.stringify({ songId: "s1", href: "https://evil.example/" }),
    );
    expect(songReturnHref("s1")).toBeNull();
  });

  it("sessionStorage が使えなくても例外にしない", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberSongReturn("s1", "/")).not.toThrow();
    spy.mockRestore();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(songReturnHref("s1")).toBeNull();
    get.mockRestore();
  });
});
