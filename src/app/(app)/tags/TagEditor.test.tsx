// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({
  addAliasAction: vi.fn(),
  createGroupAction: vi.fn(),
  deleteTagAction: vi.fn(),
  mergeTagsAction: vi.fn(),
  moveTagAction: vi.fn(),
  removeAliasAction: vi.fn(),
  renameTagAction: vi.fn(),
}));

import {
  addAliasAction,
  createGroupAction,
  deleteTagAction,
  mergeTagsAction,
  moveTagAction,
  removeAliasAction,
  renameTagAction,
} from "./actions";
import { TagEditor } from "./TagEditor";
import type { ManagedTag } from "./TagsScreen";

const ok = { status: "ok" as const };
const tag: ManagedTag = { id: "t1", name: "十八番", groupId: "g1", count: 5, aliases: ["おはこ"] };
const other: ManagedTag = { id: "t2", name: "得意", groupId: null, count: 1, aliases: [] };
const groups = [{ id: "g1", name: "気分" }];

let confirm: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => confirm.mockRestore());

function setup(t = tag, tags = [tag, other]) {
  const onClose = vi.fn();
  render(<TagEditor tag={t} tags={tags} groups={groups} onClose={onClose} />);
  return { onClose };
}

describe("TagEditor", () => {
  it("見出し・曲数・セトリへのリンク。閉じる", async () => {
    const { onClose } = setup();
    expect(screen.getByRole("heading", { name: "#十八番 を編集" })).toBeInTheDocument();
    expect(screen.getByText("このタグの曲（5曲）")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "セトリでこのタグを開く" })).toHaveAttribute(
      "href",
      "/?t=t1",
    );
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("名前を変える（同じ名前・空では押せない）", async () => {
    vi.mocked(renameTagAction).mockResolvedValue(ok);
    setup();
    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();
    const input = screen.getByLabelText("タグ名");
    await userEvent.clear(input);
    expect(save).toBeDisabled();
    await userEvent.type(input, "おはこ曲");
    await userEvent.click(save);
    expect(renameTagAction).toHaveBeenCalledWith({ id: "t1", name: "おはこ曲" });
    expect(await screen.findByRole("status")).toHaveTextContent("名前を変更しました");
    expect(refresh).toHaveBeenCalled();
  });

  it("失敗はエラーとして出す（メッセージがなければ汎用の文言）", async () => {
    vi.mocked(renameTagAction).mockResolvedValueOnce({
      status: "error",
      message: "同じ名前のタグがあります",
    });
    vi.mocked(moveTagAction).mockResolvedValueOnce({ status: "error" } as never);
    setup();
    await userEvent.type(screen.getByLabelText("タグ名"), "x");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("同じ名前のタグがあります");
    await userEvent.selectOptions(screen.getByLabelText("グループ"), "マイタグ（グループなし）");
    expect(await screen.findByRole("alert")).toHaveTextContent("うまくいきませんでした");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("グループを移す", async () => {
    vi.mocked(moveTagAction).mockResolvedValue(ok);
    setup(other);
    expect(screen.getByLabelText("グループ")).toHaveValue("");
    await userEvent.selectOptions(screen.getByLabelText("グループ"), "気分");
    expect(moveTagAction).toHaveBeenCalledWith({ id: "t2", groupId: "g1" });
    expect(await screen.findByRole("status")).toHaveTextContent("グループを移しました");
  });

  it("新しいグループを作って移す。やめると元に戻る", async () => {
    vi.mocked(createGroupAction).mockResolvedValue(ok);
    setup();
    const select = screen.getByLabelText("グループ");
    await userEvent.selectOptions(select, "＋ 新しいグループを作る");
    expect(moveTagAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByLabelText("新しいグループ名")).toBeNull();
    expect(select).toHaveValue("g1");

    await userEvent.selectOptions(select, "＋ 新しいグループを作る");
    const create = screen.getByRole("button", { name: "作成" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText("新しいグループ名"), "定番");
    await userEvent.click(create);
    expect(createGroupAction).toHaveBeenCalledWith({ name: "定番", tagId: "t1" });
    expect(await screen.findByRole("status")).toHaveTextContent("グループを作って移しました");
    expect(screen.queryByLabelText("新しいグループ名")).toBeNull();
  });

  it("別名を追加・削除する", async () => {
    vi.mocked(addAliasAction).mockResolvedValue(ok);
    vi.mocked(removeAliasAction).mockResolvedValue(ok);
    setup();
    expect(screen.getByRole("list", { name: "別名" })).toHaveTextContent("おはこ");
    const input = screen.getByLabelText("別名を追加");
    await userEvent.type(input, "得意曲");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(addAliasAction).toHaveBeenCalledWith({ tagId: "t1", alias: "得意曲" });
    expect(await screen.findByRole("status")).toHaveTextContent("別名を追加しました");
    expect(input).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "別名「おはこ」を削除" }));
    expect(removeAliasAction).toHaveBeenCalledWith({ tagId: "t1", alias: "おはこ" });
  });

  it("別名がなければ一覧を出さない。ほかにタグがなければ統合を出さない", () => {
    setup(other, [other]);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByLabelText("別のタグに統合")).toBeNull();
  });

  it("確認してから別のタグに統合し、閉じる", async () => {
    vi.mocked(mergeTagsAction).mockResolvedValue(ok);
    confirm.mockReturnValueOnce(false);
    const { onClose } = setup();
    const merge = screen.getByRole("button", { name: "統合" });
    expect(merge).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("別のタグに統合"), "#得意");
    await userEvent.click(merge);
    expect(mergeTagsAction).not.toHaveBeenCalled();
    await userEvent.click(merge);
    expect(confirm).toHaveBeenLastCalledWith(
      expect.stringContaining("「#十八番」を「#得意」に統合"),
    );
    expect(mergeTagsAction).toHaveBeenCalledWith({ sourceId: "t1", targetId: "t2" });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("確認してから削除し、閉じる", async () => {
    vi.mocked(deleteTagAction).mockResolvedValue(ok);
    confirm.mockReturnValueOnce(false);
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "このタグを削除" }));
    expect(deleteTagAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "このタグを削除" }));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("5曲からこのタグが外れます"));
    expect(deleteTagAction).toHaveBeenCalledWith("t1");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
