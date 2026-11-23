// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeTabBar } from "./HomeTabBar";

/** ページのスクロール位置を変えて、scroll イベントを送る */
function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

const tabbar = () => screen.getByRole("navigation", { name: "メインメニュー" });

beforeEach(() => {
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});
afterEach(() => {
  scrollTo(0);
  vi.restoreAllMocks();
});

describe("HomeTabBar: セトリ／上へ", () => {
  it("いちばん上にいるときは「セトリ」のリンク", () => {
    render(<HomeTabBar searchHref="/search" />);
    expect(within(tabbar()).getByRole("link", { name: "セトリ" })).toHaveAttribute("href", "/");
    expect(within(tabbar()).queryByRole("button", { name: "いちばん上へ戻る" })).toBeNull();
  });

  it("下へスクロールしているあいだは「上へ」に替わり、上に戻ると「セトリ」に戻る", () => {
    render(<HomeTabBar searchHref="/search" />);
    scrollTo(10);
    // 少しの揺れ（iPhone の引っ張り）では替えない
    expect(within(tabbar()).getByRole("link", { name: "セトリ" })).toBeInTheDocument();
    scrollTo(400);
    const up = within(tabbar()).getByRole("button", { name: "いちばん上へ戻る" });
    expect(up).toHaveTextContent("上へ");
    expect(within(tabbar()).queryByRole("link", { name: "セトリ" })).toBeNull();
    scrollTo(0);
    expect(within(tabbar()).getByRole("link", { name: "セトリ" })).toBeInTheDocument();
  });

  it("「上へ」を押すと、いちばん上まで滑らかに戻る（条件の付いた URL は変えない）", () => {
    render(<HomeTabBar searchHref="/search" />);
    scrollTo(400);
    fireEvent.click(screen.getByRole("button", { name: "いちばん上へ戻る" }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("「上へ」で戻ったら、消えたボタンの代わりに「セトリ」へフォーカスを移す。手でスクロールして戻ったときは移さない", () => {
    render(<HomeTabBar searchHref="/search" />);
    scrollTo(400);
    scrollTo(0);
    expect(document.activeElement).toBe(document.body);

    scrollTo(400);
    const up = screen.getByRole("button", { name: "いちばん上へ戻る" });
    up.focus();
    fireEvent.click(up);
    scrollTo(0);
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "セトリ" }));
  });

  it("動きを減らす設定なら、すぐに移る", () => {
    const mm = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation((q) =>
      q.includes("reduced-motion") ? ({ matches: true } as MediaQueryList) : mm(q),
    );
    render(<HomeTabBar searchHref="/search" />);
    scrollTo(400);
    fireEvent.click(screen.getByRole("button", { name: "いちばん上へ戻る" }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
