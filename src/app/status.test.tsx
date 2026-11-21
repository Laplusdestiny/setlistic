// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongRow } from "@/lib/songs/queries";

const { replace, back } = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, back }) }));
vi.mock("@/components/SongDetail", () => ({
  SongDetail: (p: { song: SongRow; onDeleted: () => void }) => (
    <button type="button" onClick={p.onDeleted}>
      {p.song.title}を削除
    </button>
  ),
}));

import RouteError from "./error";
import GlobalError from "./global-error";
import { SongPageView } from "./(app)/songs/[id]/SongPageView";
import { rememberSongReturn } from "@/lib/songs/return-to";

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => log.mockRestore());

describe.each([
  ["RouteError", RouteError, "[app error]"],
  ["GlobalError", GlobalError, "[global error]"],
] as const)("%s", (_, Screen, tag) => {
  it("エラーをログに出し、もう一度試せる。番号があれば出す", async () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    // GlobalError は <html> から描くので、document に直接描く
    render(<Screen error={error} reset={reset} />, {
      container: Screen === GlobalError ? document.documentElement : undefined,
    });
    expect(log).toHaveBeenCalledWith(tag, "abc123", "boom");
    expect(screen.getByText("エラー番号：abc123")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "もう一度試す" }));
    expect(reset).toHaveBeenCalled();
  });

  it("番号がなければ出さない", () => {
    render(<Screen error={new Error("x")} reset={() => {}} />, {
      container: Screen === GlobalError ? document.documentElement : undefined,
    });
    expect(log).toHaveBeenCalledWith(tag, "", "x");
    expect(screen.queryByText(/エラー番号/)).toBeNull();
  });
});

describe("SongPageView", () => {
  const view = () =>
    render(
      <SongPageView
        song={{ id: "s1", title: "夜に駆ける" } as SongRow}
        sing={{ logs: [], sungCount: 0, lastSungAt: null }}
        today="2026-10-12"
        allTags={[]}
        groups={[]}
        fields={[]}
      />,
    );

  beforeEach(() => {
    sessionStorage.clear();
    replace.mockReset();
    back.mockReset();
  });

  it("セトリから開いていなければ、戻るはセトリへのリンク。削除したらセトリへ戻る", async () => {
    view();
    const link = screen.getByRole("link", { name: "戻る" });
    expect(link).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("button", { name: "夜に駆けるを削除" }));
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("検索結果から開いた曲なら、戻るで前の画面（検索結果）に戻り、削除後もそこへ戻る", async () => {
    rememberSongReturn("s1", "/?q=yoru");
    // 一覧から曲の画面へ移った状態（履歴が2件）
    window.history.pushState({}, "", "/songs/s1");
    view();
    const link = screen.getByRole("link", { name: "戻る" });
    expect(link).toHaveAttribute("href", "/?q=yoru");
    await userEvent.click(link);
    expect(back).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "夜に駆けるを削除" }));
    expect(replace).toHaveBeenCalledWith("/?q=yoru");
  });

  it("履歴が無ければ（開き直したときなど）戻らず、一覧の URL へのリンクのまま", async () => {
    rememberSongReturn("s1", "/?q=yoru");
    vi.spyOn(window.history, "length", "get").mockReturnValue(1);
    view();
    const link = screen.getByRole("link", { name: "戻る" });
    await userEvent.click(link);
    expect(back).not.toHaveBeenCalled();
    expect(link).toHaveAttribute("href", "/?q=yoru");
    vi.restoreAllMocks();
  });

  it("別の曲を開いた記録なら使わない", async () => {
    rememberSongReturn("s2", "/?q=yoru");
    view();
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/");
  });
});
