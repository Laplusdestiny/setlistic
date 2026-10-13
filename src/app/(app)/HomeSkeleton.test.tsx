// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeSkeleton } from "./HomeSkeleton";

describe("HomeSkeleton", () => {
  it("読み込み中であることを読み上げ、飾りのバー・番号・アイコンは読み上げない", () => {
    const { container } = render(<HomeSkeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("曲リストを読み込み中");
    // 骨組みの番号は aria-hidden の中
    expect(
      screen.getByText("01", { selector: "span" }).closest('[aria-hidden="true"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll("ol li")).toHaveLength(7);
    const icon = container.querySelector('img[src="/icon.svg"]');
    expect(icon).toHaveAttribute("alt", "");
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("ヘッダーとタブバーは実物と同じものを出し、タブバーは読み込み中も使える", () => {
    render(<HomeSkeleton />);
    expect(screen.getByRole("heading", { level: 1, name: "セトリ" })).toBeInTheDocument();
    const tabbar = screen.getByRole("navigation", { name: "メインメニュー" });
    expect(within(tabbar).getByRole("link", { name: "セトリ" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabbar).getByRole("link", { name: "検索" })).toHaveAttribute("href", "/search");
    expect(within(tabbar).getByRole("link", { name: "曲を登録" })).toHaveAttribute("href", "/add");
  });
});
