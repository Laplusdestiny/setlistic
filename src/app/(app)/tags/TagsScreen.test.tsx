// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  placeTagAction: vi.fn(),
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
  placeTagAction,
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

describe("TagsScreen: ドラッグで並べ替え", () => {
  // 行の高さ 50、グループの間 50 で縦に並べる（気分 0〜100、ジャンル 150〜200、マイタグ 250〜300）。
  // ドラッグ中の行は --drag-y だけずれて見える
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 300, width: 300 }) as DOMRect;
  let layout: ReturnType<typeof vi.spyOn>;
  let scrollBy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    layout = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      let top = 0;
      for (const ul of document.querySelectorAll("[data-drop-group]")) {
        const rows = [...ul.children];
        if (ul === this) return rect(top, rows.length * 50);
        const i = rows.indexOf(this);
        const shift = parseFloat((this as HTMLElement).style.getPropertyValue("--drag-y")) || 0;
        if (i >= 0) return rect(top + i * 50 + shift, 50);
        top += rows.length * 50 + 50;
      }
      return rect(0, 0);
    });
    scrollBy = vi.fn();
    window.scrollBy = scrollBy as never;
    vi.mocked(placeTagAction).mockResolvedValue(ok);
  });
  afterEach(() => layout.mockRestore());

  const row = (name: string) =>
    screen.getByRole("button", { name: `#${name}を編集` }).closest("li") as HTMLElement;
  const names = (group: string) =>
    within(section(group))
      .queryAllByRole("button", { name: /を編集$/ })
      .map((b) => b.getAttribute("aria-label")?.slice(1, -3));
  const mouse = { pointerId: 1, pointerType: "mouse", button: 0 };
  const touch = { pointerId: 2, pointerType: "touch", button: 0 };
  const press = (name: string, y: number, init: object = mouse) =>
    fireEvent.pointerDown(within(row(name)).getByText(`#${name}`), {
      ...init,
      clientX: 10,
      clientY: y,
    });
  const moveTo = (y: number, init: object = mouse) =>
    fireEvent.pointerMove(window, { ...init, clientX: 10, clientY: y });
  const release = (init: object = mouse) => fireEvent.pointerUp(window, init);

  it("PC はドラッグで同じグループの中を並べ替え、離すまで行を強調する", async () => {
    setup();
    await manage();
    press("盛り上げ", 25);
    moveTo(27); // まだクリックの範囲
    expect(row("盛り上げ")).not.toHaveAttribute("data-dragging");
    moveTo(60);
    expect(row("盛り上げ")).toHaveAttribute("data-dragging");
    // つかんだ位置（行の上端から 25）のまま指に付いて動く
    expect(row("盛り上げ").style.getPropertyValue("--drag-y")).toBe("35px");
    moveTo(90);
    expect(names("気分")).toEqual(["しっとり", "盛り上げ"]);
    // 2番目に並び直しても、指の位置からずれない（90 - 25 - 50）
    expect(row("盛り上げ").style.getPropertyValue("--drag-y")).toBe("15px");
    release();
    expect(row("盛り上げ").style.getPropertyValue("--drag-y")).toBe("");
    // 離したときのクリックでは編集を開かない
    fireEvent.click(within(row("盛り上げ")).getByText("#盛り上げ"));
    expect(screen.queryByText("編集中:盛り上げ")).toBeNull();
    expect(placeTagAction).toHaveBeenCalledWith({ id: "t1", groupId: "g1", ids: ["t2", "t1"] });
    expect(row("盛り上げ")).not.toHaveAttribute("data-dragging");
    // 保存して読み直すまで、ドロップした並びのまま
    expect(names("気分")).toEqual(["しっとり", "盛り上げ"]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    // その次のクリックは普通に編集を開く
    await userEvent.click(within(row("盛り上げ")).getByText("#盛り上げ"));
    expect(screen.getByText("編集中:盛り上げ")).toBeInTheDocument();
  });

  it("別のグループ・マイタグへ移す", async () => {
    setup();
    await manage();
    press("アニソン", 175);
    moveTo(10);
    expect(names("気分")).toEqual(["アニソン", "盛り上げ", "しっとり"]);
    expect(names("ジャンル")).toEqual([]);
    release();
    expect(placeTagAction).toHaveBeenLastCalledWith({
      id: "t3",
      groupId: "g1",
      ids: ["t3", "t1", "t2"],
    });

    press("十八番", 275);
    moveTo(500); // いちばん下のさらに下はマイタグの末尾
    release();
    expect(placeTagAction).toHaveBeenCalledTimes(1); // 動いていなければ保存しない
  });

  it("保存に失敗したら元の並びに戻してメッセージ", async () => {
    vi.mocked(placeTagAction).mockResolvedValue({
      status: "error",
      message: "保存できませんでした",
    });
    setup();
    await manage();
    press("盛り上げ", 25);
    moveTo(90);
    release();
    expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした");
    expect(names("気分")).toEqual(["盛り上げ", "しっとり"]);
  });

  it("Esc・pointercancel で取り消す。↑↓ボタン・右クリックからは始めない", async () => {
    setup();
    await manage();
    press("盛り上げ", 25);
    moveTo(90);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(names("気分")).toEqual(["盛り上げ", "しっとり"]);
    release();

    press("盛り上げ", 25);
    moveTo(90);
    fireEvent.pointerCancel(window, mouse);
    release();

    fireEvent.pointerDown(screen.getByRole("button", { name: "#盛り上げを下へ" }), mouse);
    moveTo(90);
    release();
    fireEvent.pointerDown(within(row("盛り上げ")).getByText("#盛り上げ"), { ...mouse, button: 2 });
    moveTo(90);
    release();
    expect(row("盛り上げ")).not.toHaveAttribute("data-dragging");
    expect(placeTagAction).not.toHaveBeenCalled();
  });

  it("検索中・探すモードではドラッグしない", async () => {
    setup();
    await manage();
    await userEvent.type(screen.getByLabelText("タグを検索"), "盛り");
    press("盛り上げ", 25);
    moveTo(90);
    release();
    expect(placeTagAction).not.toHaveBeenCalled();
  });

  it("スマホは長押ししてから動かす。すぐ動かしたらスクロールとみなす", async () => {
    vi.useFakeTimers();
    try {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "管理" }));
      const vibrate = vi.fn();
      Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });

      // すぐに動かすとスクロール
      press("盛り上げ", 25, touch);
      moveTo(60, touch);
      act(() => vi.advanceTimersByTime(500));
      expect(row("盛り上げ")).not.toHaveAttribute("data-dragging");
      release(touch);

      press("盛り上げ", 25, touch);
      const contextMenu = fireEvent.contextMenu(row("盛り上げ"));
      expect(contextMenu).toBe(false); // 長押しのメニューを出さない
      act(() => vi.advanceTimersByTime(400));
      expect(row("盛り上げ")).toHaveAttribute("data-dragging");
      expect(vibrate).toHaveBeenCalled();
      // ドラッグ中は画面をスクロールさせない
      const tm = new Event("touchmove", { cancelable: true });
      window.dispatchEvent(tm);
      expect(tm.defaultPrevented).toBe(true);
      moveTo(90, touch);
      release(touch);
      expect(placeTagAction).toHaveBeenCalledWith({ id: "t1", groupId: "g1", ids: ["t2", "t1"] });
    } finally {
      vi.useRealTimers();
    }
  });

  it("スマホで別のグループへ移って行が作り直されても、スクロールを止め続ける", async () => {
    vi.useFakeTimers();
    try {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "管理" }));
      const touched = within(row("アニソン")).getByText("#アニソン");
      press("アニソン", 175, touch);
      act(() => vi.advanceTimersByTime(400));
      moveTo(10, touch);
      expect(names("気分")).toEqual(["アニソン", "盛り上げ", "しっとり"]);
      expect(touched.isConnected).toBe(false);
      // 触れた要素が外れると touchmove は window まで届かない
      const tm = new Event("touchmove", { cancelable: true, bubbles: true });
      touched.dispatchEvent(tm);
      expect(tm.defaultPrevented).toBe(true);
      release(touch);
      expect(placeTagAction).toHaveBeenCalledWith({
        id: "t3",
        groupId: "g1",
        ids: ["t3", "t1", "t2"],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("画面の端に近づくと自動でスクロールする", async () => {
    setup();
    await manage();
    press("十八番", 275);
    moveTo(window.innerHeight - 10);
    await vi.waitFor(() => expect(scrollBy).toHaveBeenCalledWith(0, 8));
    moveTo(10);
    await vi.waitFor(() => expect(scrollBy).toHaveBeenCalledWith(0, -8));
    release();
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
