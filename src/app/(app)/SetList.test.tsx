// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomField } from "@/lib/custom-fields";
import { EMPTY_CONDITIONS, type SearchConditions } from "@/lib/search/conditions";
import type { SongRow, TagWithCount } from "@/lib/songs/queries";
import { setViewportWidth } from "@/test/media";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));
// ./search/actions と @/app/(app)/search/actions は同じモジュール
vi.mock("./search/actions", () => ({
  deleteSavedSearchAction: vi.fn(async () => ({ status: "ok" })),
  saveSearchAction: vi.fn(),
}));
vi.mock("@/components/SongPanel", () => ({
  SongPanel: (p: { song: SongRow; onDeleted: () => void }) => (
    <div>
      <p>パネル:{p.song.title}</p>
      <button type="button" onClick={p.onDeleted}>
        パネルで削除
      </button>
    </div>
  ),
}));

import { deleteSavedSearchAction } from "./search/actions";
import { SetList } from "./SetList";

const tag = (id: string, name: string, count: number): TagWithCount => ({
  id,
  name,
  groupId: null,
  count,
  aliases: [],
});
const tags = [tag("t1", "十八番", 5), tag("t2", "アニソン", 2), tag("t3", "未使用", 0)];
const song = (id: string, title: string, over: Partial<SongRow> = {}): SongRow => ({
  id,
  title,
  artist: "YOASOBI",
  songKey: null,
  memo: null,
  appleUrl: null,
  lastSungAt: null,
  sungCount: 0,
  tags: [],
  fields: {},
  ...over,
});
const songs = [
  song("s1", "夜に駆ける", {
    songKey: -2,
    tags: [{ id: "t1", name: "十八番" }],
    fields: { f1: "高" },
  }),
  song("s2", "群青"),
];
const fields: CustomField[] = [
  {
    id: "f1",
    name: "音域",
    type: "text",
    options: [],
    sortOrder: 0,
    showInList: true,
    hidden: false,
  },
];

function setup(over: Partial<Parameters<typeof SetList>[0]> = {}) {
  const props = {
    songs,
    total: 2,
    conditions: EMPTY_CONDITIONS,
    defaultSort: "created_desc" as const,
    tags,
    groups: [],
    saved: [{ id: "q1", name: "盛り上げ", conditions: { ...EMPTY_CONDITIONS, include: ["t2"] } }],
    fields,
    listColumns: ["key", "tags"],
    today: "2026-10-12",
    ...over,
  };
  const utils = render(<SetList {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  router.replace.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("SetList: 一覧", () => {
  it("曲・キー・タグ・一覧に出す項目を並べる", () => {
    setup();
    const rows = within(screen.getByRole("region", { name: "SET LIST" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("夜に駆ける");
    expect(rows[0]).toHaveTextContent("キー -2");
    expect(rows[0]).toHaveTextContent("#十八番");
    expect(rows[0]).toHaveTextContent("音域 高");
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/songs/s1");
    expect(screen.getByRole("heading", { name: "SET LIST" })).toBeInTheDocument();
  });

  it("ヘッダーから振り返りを開ける（曲がなくても出す）", () => {
    setup({ songs: [], total: 0 });
    expect(screen.getByRole("link", { name: "振り返り" })).toHaveAttribute("href", "/stats");
  });

  it("設定で外した列は出さない", () => {
    setup({ listColumns: [], fields: [] });
    const row = within(screen.getByRole("region", { name: "SET LIST" })).getAllByRole(
      "listitem",
    )[0];
    expect(row).not.toHaveTextContent("キー");
    expect(row).not.toHaveTextContent("#十八番");
  });

  it("曲がまだないときは登録への案内だけ", () => {
    setup({ songs: [], total: 0 });
    expect(screen.getByText("まだ曲がありません。")).toBeInTheDocument();
    expect(screen.queryByLabelText("曲を検索")).toBeNull();
    expect(screen.queryByRole("button", { name: /ランダム/ })).toBeNull();
  });

  it("絞り込んで 0 件なら解除ボタン", async () => {
    setup({ songs: [], conditions: { ...EMPTY_CONDITIONS, q: "zzz" } });
    expect(screen.getByText("該当する曲がありません。")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "条件を解除する" }));
    // キーワードが変わるので、入力と同じく少し待ってから反映される
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/", { scroll: false }));
  });
});

describe("SetList: 絞り込み", () => {
  it("よく使うタグをチップに出し、押すと URL に反映する", async () => {
    setup();
    const chips = screen.getByRole("navigation", { name: "タグで絞り込み" });
    expect(within(chips).queryByRole("button", { name: "未使用" })).toBeNull();
    await userEvent.click(within(chips).getByRole("button", { name: "十八番" }));
    expect(router.replace).toHaveBeenLastCalledWith(expect.stringContaining("t1"), {
      scroll: false,
    });
    expect(within(chips).getByRole("button", { name: "十八番" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(chips).getByRole("button", { name: "十八番" }));
    expect(router.replace).toHaveBeenLastCalledWith("/", { scroll: false });
  });

  it("条件に含まれるタグは使用 0 曲でもチップに出す", () => {
    setup({ conditions: { ...EMPTY_CONDITIONS, include: ["t3"] } });
    const chips = screen.getByRole("navigation", { name: "タグで絞り込み" });
    expect(within(chips).getByRole("button", { name: "未使用" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("保存した条件のチップで条件を呼び出す", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "★ 盛り上げ" }));
    expect(router.replace).toHaveBeenCalledWith(expect.stringContaining("t2"), { scroll: false });
  });

  it("キーワードは入力が止まってから URL に反映する", async () => {
    vi.useFakeTimers();
    setup();
    const input = screen.getByLabelText("曲を検索");
    fireEvent.change(input, { target: { value: "夜" } });
    fireEvent.change(input, { target: { value: "夜に" } });
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(300));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][0]).toContain(encodeURIComponent("夜に"));
  });

  it("条件があるときは件数と要約を出し、解除できる（並び順は残す）", async () => {
    const conditions: SearchConditions = {
      ...EMPTY_CONDITIONS,
      include: ["t1"],
      sort: "title_asc",
    };
    setup({ songs: [songs[0]], conditions });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("1曲が見つかりました");
    expect(status).toHaveTextContent("#十八番");
    await userEvent.click(within(status).getByRole("button", { name: "条件を解除" }));
    expect(router.replace).toHaveBeenCalledWith("/?sort=title_asc", { scroll: false });
  });

  it("URL が外から変わったら入力欄を合わせる（戻るボタンなど）", () => {
    const { rerender, props } = setup();
    rerender(<SetList {...props} conditions={{ ...EMPTY_CONDITIONS, q: "群青" }} />);
    expect(screen.getByLabelText("曲を検索")).toHaveValue("群青");
  });
});

describe("SetList: 並び替え", () => {
  it("並び順を選ぶ。既定と同じなら URL から外す", async () => {
    setup({ conditions: { ...EMPTY_CONDITIONS, sort: "title_asc" } });
    expect(screen.getByLabelText("並び替え（現在：曲名順）")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "アーティスト名順" }));
    expect(router.replace).toHaveBeenLastCalledWith("/?sort=artist_asc", { scroll: false });
    await userEvent.click(screen.getByRole("button", { name: "最近追加順" }));
    expect(router.replace).toHaveBeenLastCalledWith("/", { scroll: false });
  });
});

describe("SetList: ランダム・キーボード", () => {
  it("スマホではランダムに選んだ曲を「これにする」でページへ", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    setup();
    await userEvent.click(screen.getByRole("button", { name: /ランダム/ }));
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("タップでスキップ"));
    await userEvent.click(screen.getByRole("button", { name: "これにする" }));
    expect(router.push).toHaveBeenCalledWith("/songs/s2");
    vi.mocked(Math.random).mockRestore();
  });

  it("PC ではランダムに選んだ曲を「これにする」で右パネルに出す", async () => {
    setViewportWidth(1000);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    Element.prototype.scrollIntoView = vi.fn();
    setup();
    await userEvent.click(screen.getByRole("button", { name: /ランダム/ }));
    await userEvent.click(screen.getByText("タップでスキップ"));
    await userEvent.click(screen.getByRole("button", { name: "これにする" }));
    expect(screen.getByText("パネル:群青")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    vi.mocked(Math.random).mockRestore();
  });

  it("「/」で検索欄にフォーカス。入力中の「/」は奪わない", async () => {
    setup();
    const input = screen.getByLabelText("曲を検索");
    fireEvent.keyDown(window, { key: "/" });
    expect(input).toHaveFocus();
    const other = document.createElement("textarea");
    document.body.append(other);
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(other).toHaveFocus();
    fireEvent.keyDown(document.body, { key: "/", ctrlKey: true });
    other.remove();
  });
});

describe("SetList: PC のレイアウト", () => {
  it("先頭の曲を右パネルに出し、行のクリックで切り替える", async () => {
    setViewportWidth(1000);
    setup();
    expect(screen.getByText("パネル:夜に駆ける")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /群青/ }));
    expect(screen.getByText("パネル:群青")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /群青/ })).toHaveAttribute("aria-current", "true");
  });

  it("修飾キー付きのクリックは通常のリンク動作に任せる", () => {
    setViewportWidth(1000);
    setup();
    const link = screen.getByRole("link", { name: /群青/ });
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    link.dispatchEvent(ev);
    expect(screen.getByText("パネル:夜に駆ける")).toBeInTheDocument();
  });

  it("パネルで削除したら先頭の曲に戻る", async () => {
    setViewportWidth(1000);
    setup();
    await userEvent.click(screen.getByRole("link", { name: /群青/ }));
    await userEvent.click(screen.getByRole("button", { name: "パネルで削除" }));
    expect(screen.getByText("パネル:夜に駆ける")).toBeInTheDocument();
  });

  it("曲がないときは案内を出す", () => {
    setViewportWidth(1000);
    setup({ songs: [], conditions: { ...EMPTY_CONDITIONS, q: "x" } });
    expect(screen.getByText("曲を選ぶと、ここに詳細が表示されます。")).toBeInTheDocument();
  });

  it("広い画面では絞り込みパネルを出し、保存した条件の削除・条件の保存ができる", async () => {
    setViewportWidth(1200);
    setup();
    const panel = screen.getByRole("complementary", { name: "絞り込み" });
    await userEvent.click(within(panel).getByRole("button", { name: "「盛り上げ」を削除" }));
    expect(deleteSavedSearchAction).toHaveBeenCalledWith("q1");
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());

    expect(within(panel).queryByLabelText("この条件に名前を付けて保存")).toBeNull();
    await userEvent.click(within(panel).getByRole("button", { name: /^盛り上げ/ }));
    expect(within(panel).getByLabelText("この条件に名前を付けて保存")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "リセット" }));
    expect(router.replace).toHaveBeenLastCalledWith("/", { scroll: false });
  });
});
