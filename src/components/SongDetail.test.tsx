// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomField } from "@/lib/custom-fields";
import type { SingState, SongRow } from "@/lib/songs/queries";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/songs/actions", () => ({
  deleteSingLogAction: vi.fn(),
  deleteSongAction: vi.fn(),
  recordSingAction: vi.fn(),
  updateSongAction: vi.fn(),
}));

import {
  deleteSingLogAction,
  deleteSongAction,
  recordSingAction,
  updateSongAction,
} from "@/app/(app)/songs/actions";
import { SongDetail } from "./SongDetail";

const field = (id: string, over: Partial<CustomField> = {}): CustomField => ({
  id,
  name: `項目${id}`,
  type: "text",
  options: [],
  sortOrder: 0,
  showInList: false,
  hidden: false,
  ...over,
});

const song: SongRow = {
  id: "s1",
  title: "夜に駆ける",
  artist: "YOASOBI",
  songKey: -2,
  practicePriority: null,
  memo: "サビ前で息継ぎ",
  appleUrl: "https://music.apple.com/jp/song/1",
  lastSungAt: "2026-10-01",
  sungCount: 2,
  tags: [{ id: "t1", name: "十八番" }],
  fields: { f1: "高め", f2: "隠す値" },
};
const sing: SingState = {
  logs: [
    { id: "l1", sungAt: "2026-10-01", ease: 2, note: "調子よし" },
    { id: "l2", sungAt: "2026-09-01", ease: null, note: null },
  ],
  sungCount: 2,
  lastSungAt: "2026-10-01",
};
const newState: SingState = { logs: [], sungCount: 3, lastSungAt: "2026-10-12" };

function setup(over: Partial<Parameters<typeof SongDetail>[0]> = {}) {
  const onDeleted = vi.fn();
  render(
    <SongDetail
      song={song}
      groups={[]}
      allTags={[
        { id: "t1", name: "十八番", groupId: null },
        { id: "t2", name: "盛り上げ", groupId: null },
      ]}
      fields={[field("f1"), field("f2", { hidden: true })]}
      initialSing={sing}
      today="2026-10-12"
      onDeleted={onDeleted}
      {...over}
    />,
  );
  return { onDeleted };
}

beforeEach(() => refresh.mockReset());

describe("SongDetail: 表示", () => {
  it("曲情報・集計・非表示でない項目・メモ・記録を出す", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("夜に駆ける");
    expect(within(screen.getByRole("list", { name: "タグ" })).getByText("#十八番")).toBeVisible();
    expect(screen.getByText("-2")).toBeInTheDocument();
    expect(screen.getByText("2回")).toBeInTheDocument();
    expect(screen.getAllByText("2026年10月1日")).toHaveLength(2);
    expect(screen.getByText("高め")).toBeInTheDocument();
    expect(screen.queryByText("隠す値")).toBeNull();
    expect(screen.getByText("サビ前で息継ぎ")).toBeInTheDocument();
    expect(screen.getByText("歌いやすさ 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apple Musicで開く" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("値のない曲は「—」や空の記録表示", () => {
    setup({
      song: { ...song, songKey: null, memo: null, appleUrl: null, tags: [], fields: {} },
      initialSing: { logs: [], sungCount: 0, lastSungAt: null },
    });
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("まだ記録がありません。")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "タグ" })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("メモ")).toBeNull();
  });
});

describe("SongDetail: 歌唱記録", () => {
  it("日付・歌いやすさ・メモを付けて記録し、集計を更新する", async () => {
    vi.mocked(recordSingAction).mockResolvedValue({ status: "ok", state: newState });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "今日歌った！を記録" }));
    expect(screen.getByLabelText("歌った日")).toHaveValue("2026-10-12");
    await userEvent.click(screen.getByRole("button", { name: "4（やや辛い）" }));
    await userEvent.click(screen.getByRole("button", { name: "1（余裕）" }));
    expect(screen.getByRole("button", { name: "1（余裕）" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.type(screen.getByLabelText("ひとことメモ（任意）"), "楽");
    await userEvent.click(screen.getByRole("button", { name: "記録する" }));

    expect(recordSingAction).toHaveBeenCalledWith({
      songId: "s1",
      sungAt: "2026-10-12",
      ease: 1,
      note: "楽",
    });
    expect(await screen.findByText("3回")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今日歌った！を記録" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("同じ歌いやすさをもう一度押すと外れる。やめるで閉じる", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "今日歌った！を記録" }));
    const three = screen.getByRole("button", { name: "3（ふつう）" });
    await userEvent.click(three);
    await userEvent.click(three);
    expect(three).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByLabelText("歌った日")).toBeNull();
  });

  it("記録の失敗はメッセージを出し、フォームは開いたまま", async () => {
    vi.mocked(recordSingAction).mockResolvedValue({
      status: "error",
      message: "未来の日付は記録できません",
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "今日歌った！を記録" }));
    await userEvent.click(screen.getByRole("button", { name: "記録する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("未来の日付は記録できません");
    expect(screen.getByLabelText("歌った日")).toBeInTheDocument();
  });

  it("記録を削除して集計を更新する", async () => {
    vi.mocked(deleteSingLogAction).mockResolvedValue({ status: "ok", state: newState });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "2026年9月1日の記録を削除" }));
    expect(deleteSingLogAction).toHaveBeenCalledWith("s1", "l2");
    expect(await screen.findByText("まだ記録がありません。")).toBeInTheDocument();
  });

  it("記録の削除に失敗したらメッセージ", async () => {
    vi.mocked(deleteSingLogAction).mockResolvedValue({
      status: "error",
      message: "削除できませんでした。",
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "2026年10月1日の記録を削除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("削除できませんでした。");
  });
});

describe("SongDetail: 練習の優先度の表示", () => {
  it("「高」と表示し、未設定は「—」", () => {
    setup({ song: { ...song, practicePriority: 1 } });
    expect(screen.getByText("練習の優先度").nextElementSibling).toHaveTextContent("高");
  });
  it("未設定は「—」", () => {
    setup();
    expect(screen.getByText("練習の優先度").nextElementSibling).toHaveTextContent("—");
  });
});

describe("SongDetail: 編集", () => {
  it("initialEditing なら、現在の値で編集フォームを開いた状態で始める", () => {
    setup({ initialEditing: true });
    expect(screen.getByRole("heading", { name: "曲を編集" })).toBeInTheDocument();
    expect(screen.getByLabelText("曲名")).toHaveValue("夜に駆ける");
    expect(screen.getByLabelText("項目f1")).toHaveValue("高め");
  });

  it("現在の値でフォームを開き、変更を保存する", async () => {
    vi.mocked(updateSongAction).mockResolvedValue({ status: "ok" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "編集" }));
    expect(screen.getByRole("heading", { name: "曲を編集" })).toBeInTheDocument();
    const title = screen.getByLabelText("曲名");
    expect(title).toHaveValue("夜に駆ける");
    // 非表示の項目は編集欄に出さない
    expect(screen.getByLabelText("項目f1")).toHaveValue("高め");
    expect(screen.queryByLabelText("項目f2")).toBeNull();

    await userEvent.clear(title);
    await userEvent.type(title, "群青");
    await userEvent.click(screen.getByRole("button", { name: "キーを上げる" }));
    await userEvent.click(screen.getByRole("button", { name: "#十八番" }));
    await userEvent.click(screen.getByRole("button", { name: "#盛り上げ" }));
    await userEvent.type(screen.getByLabelText("新しいタグ"), "新規{Enter}");
    await userEvent.type(screen.getByLabelText("新しいタグ"), "盛り上げ{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "#新規（新規タグ）を外す" }));
    await userEvent.type(screen.getByLabelText("新しいタグ"), "別{Enter}");
    await userEvent.type(screen.getByLabelText("メモ"), "！");
    await userEvent.type(screen.getByLabelText("項目f1"), "い");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(updateSongAction).toHaveBeenCalledWith({
      id: "s1",
      title: "群青",
      artist: "YOASOBI",
      songKey: -1,
      memo: "サビ前で息継ぎ！",
      practicePriority: null,
      fields: { f1: "高めい" },
      tagIds: ["t2"],
      newTags: [{ name: "別" }],
    });
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("「中」を押して保存すると practicePriority: 2 を送る", async () => {
    vi.mocked(updateSongAction).mockResolvedValue({ status: "ok" });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "編集" }));
    await userEvent.click(screen.getByRole("button", { name: "中" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(updateSongAction).toHaveBeenCalledWith(expect.objectContaining({ practicePriority: 2 }));
  });

  it("「なし」を押して保存すると practicePriority: null を送る", async () => {
    vi.mocked(updateSongAction).mockResolvedValue({ status: "ok" });
    setup({ song: { ...song, practicePriority: 1 } });
    await userEvent.click(screen.getByRole("button", { name: "編集" }));
    await userEvent.click(screen.getByRole("button", { name: "なし" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(updateSongAction).toHaveBeenCalledWith(
      expect.objectContaining({ practicePriority: null }),
    );
  });

  it("優先度に触れずに曲名だけ変えて保存しても、元の値（1）のまま送る", async () => {
    vi.mocked(updateSongAction).mockResolvedValue({ status: "ok" });
    setup({ song: { ...song, practicePriority: 1 } });
    await userEvent.click(screen.getByRole("button", { name: "編集" }));
    await userEvent.type(screen.getByLabelText("曲名"), "2");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(updateSongAction).toHaveBeenCalledWith(
      expect.objectContaining({ title: "夜に駆ける2", practicePriority: 1 }),
    );
  });

  it("押されている優先度ボタンは1つだけ（aria-pressed）", async () => {
    setup({ song: { ...song, practicePriority: 3 } });
    await userEvent.click(screen.getByRole("button", { name: "編集" }));
    const group = screen.getByRole("group", { name: "練習の優先度" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["なし", "低", "中", "高"]);
    expect(buttons.filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(within(group).getByRole("button", { name: "低" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("曲名が空だと保存できず、キャンセルで戻る", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "編集" }));
    await userEvent.clear(screen.getByLabelText("曲名"));
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("夜に駆ける");
  });

  it("保存の失敗はフォームの中に出す", async () => {
    vi.mocked(updateSongAction).mockResolvedValue({
      status: "error",
      message: "曲が見つかりません。",
    });
    setup({ song: { ...song, songKey: null, memo: null } });
    await userEvent.click(screen.getByRole("button", { name: "編集" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("曲が見つかりません。");
    expect(screen.getByRole("heading", { name: "曲を編集" })).toBeInTheDocument();
  });
});

describe("SongDetail: 削除", () => {
  it("確認ダイアログで削除すると onDeleted を呼ぶ", async () => {
    vi.mocked(deleteSongAction).mockResolvedValue({ status: "ok" });
    const { onDeleted } = setup();
    await userEvent.click(screen.getByRole("button", { name: "この曲を削除" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    await userEvent.click(within(dialog).getByRole("button", { name: "削除する" }));
    expect(deleteSongAction).toHaveBeenCalledWith("s1");
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(dialog).not.toHaveAttribute("open");
  });

  it("キャンセルで閉じ、失敗したらメッセージを出す", async () => {
    vi.mocked(deleteSongAction).mockResolvedValue({
      status: "error",
      message: "削除できませんでした",
    });
    const { onDeleted } = setup();
    await userEvent.click(screen.getByRole("button", { name: "この曲を削除" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(dialog).not.toHaveAttribute("open");

    await userEvent.click(screen.getByRole("button", { name: "この曲を削除" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "削除する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("削除できませんでした");
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
