// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_CONDITIONS, type SearchConditions } from "@/lib/search/conditions";
import { ConditionsForm } from "./ConditionsForm";

const groups = [
  { id: "g1", name: "ジャンル" },
  { id: "g2", name: "空のグループ" },
];
const tags = [
  { id: "t1", name: "アニソン", groupId: "g1" },
  { id: "t2", name: "十八番", groupId: null },
];

/** 親が状態を持つ使い方を再現し、最新の条件を外から見られるようにする */
function Harness(
  props: Partial<Parameters<typeof ConditionsForm>[0]> & { spy: (c: SearchConditions) => void },
) {
  const [c, setC] = useState<SearchConditions>(EMPTY_CONDITIONS);
  return (
    <ConditionsForm
      groups={groups}
      tags={tags}
      {...props}
      conditions={c}
      onChange={(next) => {
        setC(next);
        props.spy(next);
      }}
    />
  );
}
function setup(props: Partial<Parameters<typeof ConditionsForm>[0]> = {}) {
  const spy = vi.fn();
  render(<Harness spy={spy} {...props} />);
  return { last: () => spy.mock.lastCall![0] as SearchConditions };
}

describe("ConditionsForm", () => {
  it("タグをグループごとに出し、押すたびに 含める → 除外 → 解除", async () => {
    const { last } = setup();
    expect(screen.getByRole("heading", { name: "ジャンル" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "マイタグ" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "空のグループ" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "#アニソン（選んでいない）" }));
    expect(last().include).toEqual(["t1"]);
    await userEvent.click(screen.getByRole("button", { name: "#アニソン（含める）" }));
    expect(last()).toMatchObject({ include: [], exclude: ["t1"] });
    expect(screen.getByRole("button", { name: "#アニソン（除外）" })).toHaveTextContent(
      "−#アニソン",
    );
    await userEvent.click(screen.getByRole("button", { name: "#アニソン（除外）" }));
    expect(last()).toMatchObject({ include: [], exclude: [] });
  });

  it("タグがなければその旨を出す", () => {
    setup({ tags: [] });
    expect(screen.getByText("タグがまだありません。")).toBeInTheDocument();
  });

  it("AND / OR を切り替える", async () => {
    const { last } = setup();
    await userEvent.click(screen.getByRole("button", { name: "どれか（OR）" }));
    expect(last().tagMode).toBe("or");
    await userEvent.click(screen.getByRole("button", { name: "すべて含む（AND）" }));
    expect(last().tagMode).toBe("and");
  });

  it("キーワード欄と並び順は指定したときだけ出す", async () => {
    setup();
    expect(screen.queryByLabelText("キーワード")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("キーワード・アーティスト・ジャンル・並び順を入力する", async () => {
    const { last } = setup({ showKeyword: true, showSort: true, advancedOpen: true });
    await userEvent.type(screen.getByLabelText("キーワード"), "夜");
    await userEvent.type(screen.getByLabelText("アーティスト"), "Y");
    await userEvent.type(screen.getByLabelText("ジャンル"), "J");
    expect(last()).toMatchObject({ q: "夜", artist: "Y", genre: "J" });

    expect(screen.getByRole("radio", { name: "最近追加順" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "曲名順" }));
    expect(last().sort).toBe("title_asc");
  });

  it("年代・長さ・キー・歌いやすさを選ぶ／外す", async () => {
    const { last } = setup({ advancedOpen: true });
    await userEvent.click(screen.getByRole("button", { name: "1990年代" }));
    await userEvent.click(screen.getByRole("button", { name: "2020年代" }));
    await userEvent.click(screen.getByRole("button", { name: "1990年代" }));
    expect(last().decades).toEqual([2020]);

    await userEvent.click(screen.getByRole("button", { name: "5分以上" }));
    expect(last().durations).toEqual(["gte5"]);
    await userEvent.click(screen.getByRole("button", { name: "原キー（±0）" }));
    expect(last().keys).toEqual(["zero"]);

    const hard = screen.getByRole("button", { name: "最近辛かった" });
    await userEvent.click(hard);
    expect(last().lastEase).toBe("hard");
    expect(hard).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(hard);
    expect(last().lastEase).toBeNull();
  });

  it("「練習の優先度」に 高だけ・中以上・設定あり のチップがある", async () => {
    setup({ advancedOpen: true });
    expect(screen.getByRole("button", { name: "高だけ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中以上" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定あり" })).toBeInTheDocument();
  });

  it('「中以上」を押すと priority: "mid"、もう一度押すと null', async () => {
    const { last } = setup({ advancedOpen: true });
    const midButton = screen.getByRole("button", { name: "中以上" });
    await userEvent.click(midButton);
    expect(last().priority).toBe("mid");
    expect(midButton).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(midButton);
    expect(last().priority).toBeNull();
    expect(midButton).toHaveAttribute("aria-pressed", "false");
  });

  it("並べ替えに「練習の優先度が高い順」がある", async () => {
    setup({ showSort: true });
    expect(screen.getByRole("radio", { name: "練習の優先度が高い順" })).toBeInTheDocument();
  });
});
