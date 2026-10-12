// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/test/media";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({
  addKaraokeTagsAction: vi.fn(),
  createGroupAction: vi.fn(),
  createTagAction: vi.fn(),
  deleteGroupAction: vi.fn(),
  renameGroupAction: vi.fn(),
  reorderGroupsAction: vi.fn(),
  reorderTagsAction: vi.fn(),
}));
// 編集パネルの中身は TagEditor のテストで確かめる
vi.mock("./TagEditor", () => ({
  TagEditor: (p: { tag: { name: string }; onClose: () => void }) => (
    <div>
      <p>編集中:{p.tag.name}</p>
      <button type="button" onClick={p.onClose}>
        編集を閉じる
      </button>
    </div>
  ),
}));

import {
  addKaraokeTagsAction,
  createGroupAction,
  createTagAction,
  deleteGroupAction,
  renameGroupAction,
  reorderGroupsAction,
  reorderTagsAction,
} from "./actions";
import { TagsScreen, type ManagedTag } from "./TagsScreen";

const ok = { status: "ok" as const };
const groups = [
  { id: "g1", name: "気分" },
  { id: "g2", name: "ジャンル" },
];
const t = (
  id: string,
  name: string,
  groupId: string | null,
  aliases: string[] = [],
): ManagedTag => ({
  id,
  name,
  groupId,
  count: 2,
  aliases,
});
const tags = [
  t("t1", "盛り上げ", "g1"),
  t("t2", "しっとり", "g1", ["バラード"]),
  t("t3", "アニソン", "g2"),
  t("t4", "十八番", null),
];

let confirm: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => confirm.mockRestore());

function setup(over: Partial<Parameters<typeof TagsScreen>[0]> = {}) {
  render(<TagsScreen groups={groups} tags={tags} {...over} />);
}
const manage = () => userEvent.click(screen.getByRole("button", { name: "管理" }));
const section = (name: string) =>
  screen.getByRole("heading", { name, level: 2 }).closest("section") as HTMLElement;

describe("TagsScreen: タグから探す", () => {
  it("グループごとにタグをリンクで並べ、空のグループは出さない", () => {
    setup({ tags: tags.filter((x) => x.groupId !== "g2") });
    expect(screen.getByRole("link", { name: "#盛り上げ2" })).toHaveAttribute("href", "/?t=t1");
    expect(screen.queryByRole("heading", { name: "ジャンル" })).toBeNull();
    expect(screen.getByRole("heading", { name: "マイタグ" })).toBeInTheDocument();
  });

  it("名前・別名で検索する（半角カナも同じに扱う）", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("タグを検索"), "ﾊﾞﾗｰﾄﾞ");
    expect(screen.getAllByRole("link", { name: /^#/ }).map((a) => a.textContent)).toEqual([
      "#しっとり2",
    ]);
  });

  it("タグがなければ案内", () => {
    setup({ tags: [] });
    expect(screen.getByText(/タグはまだありません/)).toBeInTheDocument();
  });
});

describe("TagsScreen: 新規作成", () => {
  it("タグを作る（グループを選べる）", async () => {
    vi.mocked(createTagAction).mockResolvedValue(ok);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "＋ 新規" }));
    const [addTag] = screen.getAllByRole("button", { name: "追加" });
    expect(addTag).toBeDisabled();
    await userEvent.type(screen.getByLabelText("新しいタグ"), "高音つらい");
    await userEvent.selectOptions(screen.getByLabelText("グループ"), "ジャンル");
    await userEvent.click(addTag);
    expect(createTagAction).toHaveBeenCalledWith({ name: "高音つらい", groupId: "g2" });
    await vi.waitFor(() => expect(screen.queryByLabelText("新しいタグ")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("マイタグにタグを作る。失敗はメッセージ", async () => {
    vi.mocked(createTagAction).mockResolvedValue({
      status: "error",
      message: "同じ名前のタグがあります",
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "＋ 新規" }));
    await userEvent.type(screen.getByLabelText("新しいタグ"), "十八番{Enter}");
    expect(createTagAction).toHaveBeenCalledWith({ name: "十八番", groupId: null });
    expect(await screen.findByRole("alert")).toHaveTextContent("同じ名前のタグがあります");
  });

  it("グループを作ると管理モードに切り替える", async () => {
    vi.mocked(createGroupAction).mockResolvedValue(ok);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "＋ 新規" }));
    await userEvent.type(screen.getByLabelText("新しいグループ"), "定番");
    await userEvent.click(screen.getAllByRole("button", { name: "追加" })[1]);
    expect(createGroupAction).toHaveBeenCalledWith({ name: "定番" });
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "管理" })).toHaveAttribute("aria-pressed", "true"),
    );
  });
});

describe("TagsScreen: 管理", () => {
  it("タグとグループを並べ替える（端と検索中は押せない）", async () => {
    vi.mocked(reorderTagsAction).mockResolvedValue(ok);
    vi.mocked(reorderGroupsAction).mockResolvedValue(ok);
    setup();
    await manage();
    expect(screen.getByRole("button", { name: "#盛り上げを上へ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "#しっとりを下へ" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "#盛り上げを下へ" }));
    expect(reorderTagsAction).toHaveBeenCalledWith(["t2", "t1"]);
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "#しっとりを上へ" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "#しっとりを上へ" }));
    expect(reorderTagsAction).toHaveBeenLastCalledWith(["t2", "t1"]);

    expect(screen.getByRole("button", { name: "気分を上へ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ジャンルを下へ" })).toBeDisabled();
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "ジャンルを上へ" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "ジャンルを上へ" }));
    expect(reorderGroupsAction).toHaveBeenCalledWith(["g2", "g1"]);
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "気分を下へ" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "気分を下へ" }));
    expect(reorderGroupsAction).toHaveBeenLastCalledWith(["g2", "g1"]);

    await userEvent.type(screen.getByLabelText("タグを検索"), "し");
    expect(screen.getByRole("button", { name: "#しっとりを上へ" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "＋ タグを追加" })).toBeNull();
  });

  it("グループの名前を変える・やめる", async () => {
    vi.mocked(renameGroupAction).mockResolvedValue(ok);
    setup();
    await manage();
    await userEvent.click(within(section("気分")).getByRole("button", { name: "名前を変更" }));
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByLabelText("グループ名")).toBeNull();

    await userEvent.click(within(section("気分")).getByRole("button", { name: "名前を変更" }));
    const input = screen.getByLabelText("グループ名");
    await userEvent.clear(input);
    await userEvent.type(input, "ムード");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(renameGroupAction).toHaveBeenCalledWith({ id: "g1", name: "ムード" });
    await vi.waitFor(() => expect(screen.queryByLabelText("グループ名")).toBeNull());
  });

  it("確認してからグループを削除する", async () => {
    vi.mocked(deleteGroupAction).mockResolvedValue(ok);
    confirm.mockReturnValueOnce(false);
    setup();
    await manage();
    const del = within(section("ジャンル")).getByRole("button", { name: "削除" });
    await userEvent.click(del);
    expect(deleteGroupAction).not.toHaveBeenCalled();
    await userEvent.click(del);
    expect(deleteGroupAction).toHaveBeenCalledWith("g2");
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("「マイタグ」に移ります"));
  });

  it("グループ内・マイタグにその場でタグを追加する（Esc で閉じる）", async () => {
    vi.mocked(createTagAction).mockResolvedValue(ok);
    setup({ tags: tags.filter((x) => x.groupId) });
    await manage();
    expect(within(section("マイタグ")).getByText("タグはありません")).toBeInTheDocument();

    await userEvent.click(within(section("気分")).getByRole("button", { name: "＋ タグを追加" }));
    const input = screen.getByLabelText("気分に追加するタグ名");
    expect(input).toHaveFocus();
    await userEvent.type(input, "{Escape}");
    expect(screen.queryByLabelText("気分に追加するタグ名")).toBeNull();

    await userEvent.click(
      within(section("マイタグ")).getByRole("button", { name: "＋ タグを追加" }),
    );
    await userEvent.type(screen.getByLabelText("マイタグに追加するタグ名"), "十八番{Enter}");
    expect(createTagAction).toHaveBeenCalledWith({ name: "十八番", groupId: null });
    await vi.waitFor(() => expect(screen.queryByLabelText("マイタグに追加するタグ名")).toBeNull());

    await userEvent.click(within(section("気分")).getByRole("button", { name: "＋ タグを追加" }));
    await userEvent.type(screen.getByLabelText("気分に追加するタグ名"), "x");
    await userEvent.click(within(section("気分")).getByRole("button", { name: "やめる" }));
    expect(screen.queryByLabelText("気分に追加するタグ名")).toBeNull();
  });

  it("新しいグループとカラオケ機種のタグを作る", async () => {
    vi.mocked(createGroupAction).mockResolvedValue(ok);
    vi.mocked(addKaraokeTagsAction).mockResolvedValue(ok);
    setup();
    await manage();
    const box = screen.getByRole("region", { name: "グループの追加" });
    await userEvent.click(within(box).getByRole("button", { name: "＋ 新しいグループ" }));
    await userEvent.type(within(box).getByLabelText("新しいグループ名"), "定番{Enter}");
    expect(createGroupAction).toHaveBeenCalledWith({ name: "定番" });
    await userEvent.click(
      within(box).getByRole("button", { name: "＋ カラオケ機種のタグ（DAM・JOYSOUND）" }),
    );
    expect(addKaraokeTagsAction).toHaveBeenCalled();
  });

  it("カラオケ機種のタグがそろっていればボタンを出さない", async () => {
    setup({ tags: [...tags, t("k1", "DAM", null), t("k2", "JOYSOUND", null)] });
    await manage();
    expect(screen.queryByRole("button", { name: /カラオケ機種のタグ/ })).toBeNull();
  });
});

describe("TagsScreen: タグの編集", () => {
  it("スマホではダイアログで開き、閉じると選択を外す", async () => {
    setup();
    await manage();
    await userEvent.click(screen.getByRole("button", { name: "#アニソンを編集" }));
    const dialog = screen.getByRole("dialog", { name: "タグの編集" });
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByText("編集中:アニソン")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "編集を閉じる" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(screen.queryByText("編集中:アニソン")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^#十八番2曲/ }));
    fireEvent(dialog, new Event("close"));
    expect(screen.queryByText("編集中:十八番")).toBeNull();
  });

  it("PC では右パネルに出す", async () => {
    setViewportWidth(1000);
    setup();
    await manage();
    const aside = screen.getByRole("complementary", { name: "タグの編集" });
    expect(aside).toHaveTextContent("管理モードでタグを選ぶと");
    await userEvent.click(screen.getByRole("button", { name: "#盛り上げを編集" }));
    expect(within(aside).getByText("編集中:盛り上げ")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
  });
});
