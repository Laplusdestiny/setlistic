// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CONDITIONS } from "@/lib/search/conditions";

const router = vi.hoisted(() => ({ back: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./actions", () => ({
  deleteSavedSearchAction: vi.fn(async () => ({ status: "ok" })),
  saveSearchAction: vi.fn(),
}));

import { deleteSavedSearchAction } from "./actions";
import { SearchScreen } from "./SearchScreen";

const tags = [{ id: "t1", name: "十八番", groupId: null }];
const saved = [{ id: "q1", name: "90年代", conditions: { ...EMPTY_CONDITIONS, decades: [1990] } }];

beforeEach(() => {
  router.back.mockReset();
  router.refresh.mockReset();
});

describe("SearchScreen", () => {
  it("条件なしなら全曲を表示するリンク", () => {
    render(<SearchScreen initial={EMPTY_CONDITIONS} tags={tags} groups={[]} saved={[]} />);
    expect(screen.getByRole("link", { name: "すべての曲を表示" })).toHaveAttribute("href", "/");
    expect(screen.queryByLabelText("この条件に名前を付けて保存")).toBeNull();
  });

  it("条件を組み立てると件数とリンクが変わり、保存欄が出る", async () => {
    render(<SearchScreen initial={EMPTY_CONDITIONS} tags={tags} groups={[]} saved={[]} />);
    await userEvent.type(screen.getByLabelText("キーワード"), "夜");
    await userEvent.click(screen.getByRole("button", { name: "#十八番（選んでいない）" }));
    const link = screen.getByRole("link", { name: "2個の条件で絞り込む" });
    expect(link.getAttribute("href")).toMatch(/^\/\?/);
    expect(screen.getByLabelText("この条件に名前を付けて保存")).toBeInTheDocument();
  });

  it("リセットしても並び順は残す", async () => {
    render(
      <SearchScreen
        initial={{ ...EMPTY_CONDITIONS, q: "夜", sort: "title_asc" }}
        tags={tags}
        groups={[]}
        saved={[]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "リセット" }));
    expect(screen.getByLabelText("キーワード")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "曲名順" })).toBeChecked();
  });

  it("詳しい条件があれば最初から開く", () => {
    render(
      <SearchScreen
        initial={{ ...EMPTY_CONDITIONS, lastEase: "hard" }}
        tags={tags}
        groups={[]}
        saved={[]}
      />,
    );
    expect(screen.getByText(/詳しい条件/).closest("details")).toHaveAttribute("open");
  });

  it("保存した条件を呼び出し・削除する。戻るボタン", async () => {
    render(<SearchScreen initial={EMPTY_CONDITIONS} tags={tags} groups={[]} saved={saved} />);
    await userEvent.click(screen.getByRole("button", { name: /^90年代/ }));
    expect(screen.getByRole("button", { name: "1990年代" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "「90年代」を削除" }));
    expect(deleteSavedSearchAction).toHaveBeenCalledWith("q1");
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(router.back).toHaveBeenCalled();
  });
});
