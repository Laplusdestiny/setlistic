// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongRow } from "@/lib/songs/queries";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
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
  it("戻るリンクを出し、削除したらセトリへ戻る", async () => {
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
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("button", { name: "夜に駆けるを削除" }));
    expect(replace).toHaveBeenCalledWith("/");
  });
});
