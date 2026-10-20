// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ bulkEditTagsAction: vi.fn() }));

import { bulkEditTagsAction } from "./actions";
import { BulkEditScreen } from "./BulkEditScreen";

const songs = [
  { id: "s1", title: "夜に駆ける", artist: "YOASOBI", tags: [{ id: "t1", name: "十八番" }] },
  {
    id: "s2",
    title: "群青",
    artist: "YOASOBI",
    tags: [
      { id: "t1", name: "十八番" },
      { id: "t2", name: "アニソン" },
    ],
  },
  { id: "s3", title: "紅蓮華", artist: "LiSA", tags: [] },
];
const tags = [
  { id: "t1", name: "十八番", groupId: null, count: 2 },
  { id: "t2", name: "アニソン", groupId: null, count: 1 },
  { id: "t3", name: "盛り上げ", groupId: null, count: 0 },
];

function setup(preselectedIds: string[] = [], list = songs) {
  render(<BulkEditScreen songs={list} tags={tags} groups={[]} preselectedIds={preselectedIds} />);
}
const songList = () => screen.getByRole("region", { name: "曲を選ぶ" });
const check = (title: string) =>
  within(songList()).getByRole("checkbox", { name: new RegExp(title) });
const removeBox = () => screen.getByRole("region", { name: "外すタグ" });

beforeEach(() => {
  refresh.mockReset();
  vi.mocked(bulkEditTagsAction).mockReset();
});

describe("BulkEditScreen: 曲を選ぶ", () => {
  it("知っている曲だけを選択済みにして開く", () => {
    setup(["s1", "unknown"]);
    expect(screen.getByText("1曲を選択中")).toBeInTheDocument();
    expect(check("夜に駆ける")).toBeChecked();
  });

  it("キーワード（曲名・アーティスト・タグ）とタグなしで絞り込む", async () => {
    setup();
    const q = screen.getByLabelText("曲を絞り込む");
    await userEvent.type(q, "lisa");
    expect(within(songList()).getAllByRole("checkbox")).toHaveLength(1);
    await userEvent.clear(q);
    await userEvent.type(q, "アニソン");
    expect(within(songList()).getAllByRole("checkbox")).toHaveLength(1);
    await userEvent.type(q, "zzz");
    expect(screen.getByText("該当する曲がありません。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "表示中の0曲をすべて選ぶ" })).toBeDisabled();
    await userEvent.clear(q);

    await userEvent.click(screen.getByRole("button", { name: "タグなしの曲だけ（1）" }));
    expect(within(songList()).getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText("タグなし")).toBeInTheDocument();
  });

  it("表示中をすべて選ぶ／解除、選択の全解除", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "表示中の3曲をすべて選ぶ" }));
    expect(screen.getByText("3曲を選択中")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "表示中をすべて解除" }));
    expect(screen.getByText("0曲を選択中")).toBeInTheDocument();
    await userEvent.click(check("群青"));
    await userEvent.click(screen.getByRole("button", { name: "選択を解除" }));
    expect(check("群青")).not.toBeChecked();
  });

  it("曲がなければその旨を出す", () => {
    setup([], []);
    expect(screen.getByText("曲がまだありません。")).toBeInTheDocument();
  });
});

describe("BulkEditScreen: タグの変更", () => {
  it("選んだ曲に付いているタグを、付いている曲数とともに外す候補にする", async () => {
    setup();
    expect(within(removeBox()).getByText(/曲を選ぶと/)).toBeInTheDocument();
    await userEvent.click(check("紅蓮華"));
    expect(within(removeBox()).getByText("選んだ曲にはタグが付いていません。")).toBeInTheDocument();
    await userEvent.click(check("夜に駆ける"));
    await userEvent.click(check("群青"));
    const chips = within(removeBox()).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["#十八番2曲", "#アニソン1曲"]);
  });

  it("付けるタグと外すタグを選んで適用する", async () => {
    vi.mocked(bulkEditTagsAction).mockResolvedValue({ status: "ok", count: 2 });
    setup(["s1", "s2"]);
    const apply = screen.getByRole("button", { name: "2曲に適用" });
    expect(apply).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "#盛り上げ" }));
    await userEvent.type(screen.getByLabelText("新しいタグ"), "新{Enter}");
    expect(screen.getByText(/2曲に #盛り上げ #新（新規） を付けます/)).toBeInTheDocument();
    await userEvent.click(within(removeBox()).getByRole("button", { name: /アニソン/ }));
    expect(screen.getByText(/を付け、#アニソン を外します/)).toBeInTheDocument();

    await userEvent.click(apply);
    expect(bulkEditTagsAction).toHaveBeenCalledWith({
      songIds: ["s1", "s2"],
      addTagIds: ["t3"],
      newTags: [{ name: "新" }],
      removeTagIds: ["t2"],
      priority: "keep",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("2曲を変更しました");
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "#盛り上げ" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("外すだけの変更と、付けるタグに選んだものは外せないこと", async () => {
    setup(["s1"]);
    await userEvent.click(within(removeBox()).getByRole("button", { name: /十八番/ }));
    expect(screen.getByText(/1曲に #十八番 を外します/)).toBeInTheDocument();
    await userEvent.click(within(removeBox()).getByRole("button", { name: /十八番/ }));
    await userEvent.click(screen.getByRole("button", { name: "#十八番" }));
    expect(within(removeBox()).getByRole("button", { name: /十八番/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "#十八番" }));
    await userEvent.type(screen.getByLabelText("新しいタグ"), "十八番{Enter}");
    expect(screen.getByRole("button", { name: "#十八番" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(screen.getByLabelText("新しいタグ"), "x{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "#x（新規タグ）を外す" }));
  });

  it("失敗はメッセージを出す", async () => {
    vi.mocked(bulkEditTagsAction).mockResolvedValue({
      status: "error",
      message: "変更できませんでした",
    });
    setup(["s1"]);
    await userEvent.click(screen.getByRole("button", { name: "#盛り上げ" }));
    await userEvent.click(screen.getByRole("button", { name: "1曲に適用" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("変更できませんでした");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("曲を選んでいなければ適用できない", async () => {
    setup();
    expect(screen.getByRole("button", { name: "曲を選んでください" })).toBeDisabled();
  });

  it("501曲以上選ぶと上限の案内", () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      id: `s${i}`,
      title: `曲${i}`,
      artist: "a",
      tags: [],
    }));
    setup(
      many.map((s) => s.id),
      many,
    );
    expect(screen.getByText("一度に変更できるのは500曲までです。")).toBeInTheDocument();
  });
});

describe("BulkEditScreen: 練習の優先度", () => {
  const prioBox = () => screen.getByRole("group", { name: "練習の優先度をまとめて変える" });

  it("見出しと、既定は「変えない」", () => {
    setup(["s1"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("タグ・優先度の一括変更");
    expect(within(prioBox()).getByRole("button", { name: "変えない" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "1曲に適用" })).toBeDisabled();
  });

  it("優先度だけ選んで適用でき、適用後は「変えない」に戻る", async () => {
    vi.mocked(bulkEditTagsAction).mockResolvedValue({ status: "ok", count: 1 });
    setup(["s1"]);
    await userEvent.click(within(prioBox()).getByRole("button", { name: "高" }));
    expect(within(prioBox()).getByRole("button", { name: "高" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("1曲に練習の優先度を「高」に変えます")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "1曲に適用" }));
    expect(bulkEditTagsAction).toHaveBeenCalledWith(expect.objectContaining({ priority: 1 }));
    expect(await screen.findByRole("status")).toHaveTextContent("1曲を変更しました");
    expect(within(prioBox()).getByRole("button", { name: "変えない" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("「なし」は解除として送る", async () => {
    vi.mocked(bulkEditTagsAction).mockResolvedValue({ status: "ok", count: 1 });
    setup(["s1"]);
    await userEvent.click(within(prioBox()).getByRole("button", { name: "なし" }));
    await userEvent.click(screen.getByRole("button", { name: "1曲に適用" }));
    expect(bulkEditTagsAction).toHaveBeenCalledWith(expect.objectContaining({ priority: "none" }));
  });
});
