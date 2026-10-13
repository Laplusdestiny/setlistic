// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CONDITIONS } from "@/lib/search/conditions";
import type { SongRow } from "@/lib/songs/queries";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), pathname: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh, push: nav.push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => nav.pathname,
}));
vi.mock("@/app/(app)/search/actions", () => ({ saveSearchAction: vi.fn() }));
vi.mock("@/app/(app)/songs/actions", () => ({ loadSingStateAction: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));
// SongPanel のテストでは、中身の SongDetail は受け取った値の確認だけにする
vi.mock("./SongDetail", () => ({
  SongDetail: (p: { song: SongRow; initialSing: { sungCount: number } }) => (
    <p>
      詳細:{p.song.title}:{p.initialSing.sungCount}
    </p>
  ),
}));

import { saveSearchAction } from "@/app/(app)/search/actions";
import { loadSingStateAction } from "@/app/(app)/songs/actions";
import { SavedSearchList } from "./SavedSearchList";
import { SaveSearchForm } from "./SaveSearchForm";
import { Sidebar, SidebarSkeleton } from "./Sidebar";
import { SongPanel } from "./SongPanel";
import { TagPicker } from "./TagPicker";

beforeEach(() => {
  nav.refresh.mockReset();
  nav.pathname = "/";
});

describe("TagPicker", () => {
  const groups = [{ id: "g1", name: "ジャンル" }];
  const tags = [
    { id: "t1", name: "アニソン", groupId: "g1" },
    { id: "t2", name: "十八番", groupId: null },
    { id: "t3", name: "DAM", groupId: "deleted-group" },
  ];
  function setup(over: Partial<Parameters<typeof TagPicker>[0]> = {}) {
    const props = {
      groups,
      tags,
      selectedIds: new Set(["t1"]),
      newTags: [{ name: "新曲" }],
      onToggle: vi.fn(),
      onAddNew: vi.fn(),
      onRemoveNew: vi.fn(),
      onSelect: vi.fn(),
      ...over,
    };
    render(<TagPicker {...props} />);
    return { props, input: screen.getByLabelText("新しいタグ") };
  }

  it("グループごと・マイタグに分けて並べ、選択状態を示す", async () => {
    const { props } = setup({ heading: "付けるタグ" });
    expect(screen.getByRole("heading", { name: "付けるタグ" })).toBeInTheDocument();
    expect(screen.getByText("ジャンル")).toBeInTheDocument();
    expect(screen.getByText("マイタグ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "#アニソン" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "#DAM" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "#十八番" }));
    expect(props.onToggle).toHaveBeenCalledWith("t2");
    await userEvent.click(screen.getByRole("button", { name: "#新曲（新規タグ）を外す" }));
    expect(props.onRemoveNew).toHaveBeenCalledWith("新曲");
  });

  it("Enter で、既存タグと同じ名前なら選択、なければ新規追加", async () => {
    const { props, input } = setup();
    await userEvent.type(input, "ｄａｍ{Enter}");
    expect(props.onSelect).toHaveBeenCalledWith("t3");
    expect(input).toHaveValue("");

    await userEvent.type(input, "#盛り上げ");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(props.onAddNew).toHaveBeenCalledWith({ name: "盛り上げ" });
  });

  it("追加済みの新規タグは重ねて追加しない", async () => {
    const { props, input } = setup();
    await userEvent.type(input, "新曲{Enter}");
    expect(props.onAddNew).not.toHaveBeenCalled();
  });

  it("空・長すぎる入力はエラー（空白だけなら黙って無視）", async () => {
    const { input } = setup();
    await userEvent.type(input, "{Enter}");
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.type(input, "#{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("タグ名を入力してください");
    await userEvent.clear(input);
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.type(input, "あ".repeat(31) + "{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("30文字まで");
  });

  it("入力中は候補を出し、選ぶと付け外し、または新規作成する", async () => {
    const { props, input } = setup();
    await userEvent.type(input, "アニ");
    const box = screen.getByRole("group", { name: "タグの候補" });
    expect(box).toHaveTextContent("選択中（タップで外す）");
    await userEvent.click(screen.getByRole("button", { name: /^#アニソン選択中/ }));
    expect(props.onToggle).toHaveBeenCalledWith("t1");
    expect(input).toHaveValue("");

    await userEvent.type(input, "十");
    expect(screen.getByRole("button", { name: /^#十八番タップで付ける/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "「#十」を新しいタグとして追加" }));
    expect(props.onAddNew).toHaveBeenCalledWith({ name: "十" });
  });
});

describe("SaveSearchForm", () => {
  const conditions = { ...EMPTY_CONDITIONS, q: "夜" };

  it("名前を付けて保存し、画面を更新する", async () => {
    vi.mocked(saveSearchAction).mockResolvedValue({ status: "ok" });
    const onSaved = vi.fn();
    render(<SaveSearchForm conditions={conditions} suggestedName="夜" onSaved={onSaved} />);
    const input = screen.getByLabelText("この条件に名前を付けて保存");
    expect(input).toHaveValue("夜");
    await userEvent.type(input, "の曲");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("status")).toHaveTextContent("保存しました");
    expect(saveSearchAction).toHaveBeenCalledWith({ name: "夜の曲", conditions });
    expect(nav.refresh).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("名前が空なら保存できず、失敗はメッセージを出す", async () => {
    vi.mocked(saveSearchAction).mockResolvedValue({ status: "error", message: "30件までです" });
    render(<SaveSearchForm conditions={conditions} suggestedName="" />);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("30件までです");
    expect(nav.refresh).not.toHaveBeenCalled();
  });
});

describe("SavedSearchList", () => {
  const saved = [
    { id: "q1", name: "十八番", conditions: { ...EMPTY_CONDITIONS, include: ["t1"] } },
    { id: "q2", name: "全部", conditions: EMPTY_CONDITIONS },
  ];

  it("空なら何も出さない", () => {
    const { container } = render(
      <SavedSearchList saved={[]} tagName={() => undefined} onApply={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("条件の要約を出し、適用・削除を通知する", async () => {
    const onApply = vi.fn();
    const onDelete = vi.fn();
    render(
      <SavedSearchList
        saved={saved}
        tagName={(id) => (id === "t1" ? "十八番" : undefined)}
        onApply={onApply}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^十八番/ }));
    expect(onApply).toHaveBeenCalledWith(saved[0]);
    await userEvent.click(screen.getByRole("button", { name: "「全部」を削除" }));
    expect(onDelete).toHaveBeenCalledWith(saved[1]);
  });

  it("onDelete がなければ削除ボタンを出さない。disabled で押せない", () => {
    render(<SavedSearchList saved={saved} tagName={() => undefined} onApply={() => {}} disabled />);
    expect(screen.queryByRole("button", { name: /を削除/ })).toBeNull();
    expect(screen.getByRole("button", { name: "全部" })).toBeDisabled();
  });
});

describe("Sidebar", () => {
  const current = () =>
    screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page")
      .map((a) => a.textContent);

  it.each([
    ["/", ["セトリ（曲一覧）"]],
    ["/songs/1", ["セトリ（曲一覧）"]],
    ["/search", ["セトリ（曲一覧）"]],
    ["/tags", ["タグ管理"]],
    ["/settings", ["設定"]],
    ["/add", ["＋ 曲を登録"]],
  ])("%s を開いているときの現在地", (path, expected) => {
    nav.pathname = path;
    render(<Sidebar />);
    expect(current()).toEqual(expected);
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeInTheDocument();
  });

  it("読み込み中の骨組みは読み上げず、リンクも持たない", () => {
    const { container } = render(<SidebarSkeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("SongPanel", () => {
  const song = { id: "s1", title: "夜に駆ける" } as SongRow;
  const props = { groups: [], allTags: [], fields: [], today: "2026-10-12", onDeleted: () => {} };

  it("記録を読み込むまでは待ち表示、読めたら詳細を出す", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(loadSingStateAction).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    const { container } = render(<SongPanel song={song} {...props} />);
    expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
    await act(async () => resolve({ logs: [], sungCount: 4, lastSungAt: null }));
    expect(screen.getByText("詳細:夜に駆ける:4")).toBeInTheDocument();
    expect(loadSingStateAction).toHaveBeenCalledWith("s1");
  });

  it("null や例外なら読み込み失敗を出す", async () => {
    vi.mocked(loadSingStateAction).mockResolvedValueOnce(null);
    const { unmount } = render(<SongPanel song={song} {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("読み込めませんでした");
    unmount();
    vi.mocked(loadSingStateAction).mockRejectedValueOnce(new Error("x"));
    render(<SongPanel song={song} {...props} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("読み込み中に曲が変わったら前の結果を捨てる", async () => {
    let first!: (v: unknown) => void;
    vi.mocked(loadSingStateAction)
      .mockReturnValueOnce(new Promise((r) => (first = r)) as never)
      .mockResolvedValueOnce({ logs: [], sungCount: 9, lastSungAt: null });
    const { rerender } = render(<SongPanel song={song} {...props} />);
    rerender(<SongPanel song={{ ...song, id: "s2", title: "群青" }} {...props} />);
    await waitFor(() => expect(screen.getByText("詳細:群青:9")).toBeInTheDocument());
    await act(async () => first({ logs: [], sungCount: 1, lastSungAt: null }));
    expect(screen.getByText("詳細:群青:9")).toBeInTheDocument();
  });
});
