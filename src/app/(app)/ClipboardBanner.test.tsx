// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => nav.pathname,
}));

import { ClipboardBanner } from "./ClipboardBanner";

/** iPhone のホーム画面から起動している状態（navigator.standalone）にする */
function standalone(on: boolean) {
  Object.defineProperty(window.navigator, "standalone", { value: on, configurable: true });
}
function clipboard(readText: () => Promise<string>) {
  Object.defineProperty(window.navigator, "clipboard", {
    value: { readText: vi.fn(readText) },
    configurable: true,
  });
}
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

const button = () => screen.queryByRole("button", { name: "コピーしたURLから登録" });

beforeEach(() => {
  router.push.mockReset();
  nav.pathname = "/";
  standalone(true);
  clipboard(async () => "");
});
afterEach(() => {
  standalone(false);
  vi.useRealTimers();
});

describe("ClipboardBanner", () => {
  it("iPhone のホーム画面から開いたときに出す", () => {
    render(<ClipboardBanner />);
    expect(button()).toBeInTheDocument();
  });

  it("ブラウザで開いているとき（Android も含む）は出さない", () => {
    standalone(false);
    render(<ClipboardBanner />);
    expect(button()).not.toBeInTheDocument();
  });

  it("登録画面では出さない（ペーストボタンがあるため）", () => {
    nav.pathname = "/add";
    render(<ClipboardBanner />);
    expect(button()).not.toBeInTheDocument();
  });

  it("押すとコピーしたURLを入れた登録画面へ移る", async () => {
    clipboard(async () => "曲名 https://open.spotify.com/track/abc?si=x 聴いて");
    render(<ClipboardBanner />);
    await act(async () => fireEvent.click(button()!));
    expect(router.push).toHaveBeenCalledWith(
      "/add?url=" + encodeURIComponent("https://open.spotify.com/track/abc?si=x"),
    );
    expect(button()).not.toBeInTheDocument();
  });

  it("コピーした中にURLが無ければ知らせる", async () => {
    clipboard(async () => "ただの文字");
    render(<ClipboardBanner />);
    await act(async () => fireEvent.click(button()!));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("コピーした中にURLがありません");
  });

  it("貼り付けが許可されなかったときは何もしない", async () => {
    clipboard(async () => {
      throw new Error("NotAllowedError");
    });
    render(<ClipboardBanner />);
    await act(async () => fireEvent.click(button()!));
    expect(router.push).not.toHaveBeenCalled();
    expect(button()).toBeInTheDocument();
  });

  it("×で閉じる", () => {
    render(<ClipboardBanner />);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(button()).not.toBeInTheDocument();
  });

  it("しばらくすると消え、アプリが前面に戻るとまた出る", () => {
    vi.useFakeTimers();
    render(<ClipboardBanner />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(button()).not.toBeInTheDocument();

    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    expect(button()).toBeInTheDocument();
  });
});
