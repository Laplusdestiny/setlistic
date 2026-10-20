// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomField } from "@/lib/custom-fields";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));
vi.mock("./actions", () => ({
  saveDisplaySettingsAction: vi.fn(),
  createFieldAction: vi.fn(),
  updateFieldAction: vi.fn(),
  deleteFieldAction: vi.fn(),
  reorderFieldsAction: vi.fn(),
  deleteAccountAction: vi.fn(),
}));

import {
  createFieldAction,
  deleteAccountAction,
  deleteFieldAction,
  reorderFieldsAction,
  saveDisplaySettingsAction,
  updateFieldAction,
} from "./actions";
import { DangerSection } from "./DangerSection";
import { DataSection } from "./DataSection";
import { FieldsSection } from "./FieldsSection";
import { SettingsScreen } from "./SettingsScreen";

const ok = { status: "ok" as const };
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

beforeEach(() => {
  refresh.mockReset();
  vi.clearAllMocks();
});

describe("SettingsScreen", () => {
  const settings = {
    listSort: "created_desc" as const,
    listColumns: ["key"],
    defaultTagIds: ["t1"],
  };
  const tags = [
    { id: "t1", name: "十八番", groupId: null },
    { id: "t2", name: "アニソン", groupId: "g1" },
  ];
  function setup(over: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
    render(
      <SettingsScreen
        email="me@example.com"
        settings={settings}
        fields={[]}
        tags={tags}
        groups={[{ id: "g1", name: "ジャンル" }]}
        isAdmin={false}
        quota={{ used: 10, max: 500 }}
        {...over}
      />,
    );
  }
  const view = () => screen.getByRole("region", { name: "表示と登録" });

  it("アカウント情報と曲数を出す。管理者だけ招待のリンク", () => {
    setup();
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByText("10 / 500曲")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /招待の管理/ })).toBeNull();
  });

  it("上限が近いと注記、メールがなければ —、管理者には招待のリンク", () => {
    setup({ email: "", quota: { used: 480, max: 500 }, isAdmin: true });
    expect(screen.getByText(/上限に近づいています/)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /招待の管理/ })).toHaveAttribute(
      "href",
      "/admin/invites",
    );
  });

  it("上限が不明なら曲数の行を出さない", () => {
    setup({ quota: null });
    expect(screen.queryByText("登録できる曲数")).toBeNull();
  });

  it("並び順・一覧の項目・登録時のタグを保存する", async () => {
    vi.mocked(saveDisplaySettingsAction).mockResolvedValue(ok);
    setup();
    await userEvent.selectOptions(within(view()).getByLabelText("一覧の並び順（既定）"), "曲名順");
    await userEvent.click(within(view()).getByLabelText("キー"));
    await userEvent.click(within(view()).getByLabelText("タグ"));
    await userEvent.click(within(view()).getByLabelText("練習の優先度"));
    await userEvent.click(within(view()).getByRole("button", { name: "#十八番" }));
    await userEvent.click(within(view()).getByRole("button", { name: "#アニソン" }));
    expect(within(view()).getByText("ジャンル")).toBeInTheDocument();
    expect(within(view()).getByText("マイタグ")).toBeInTheDocument();
    await userEvent.click(within(view()).getByRole("button", { name: "保存" }));
    expect(saveDisplaySettingsAction).toHaveBeenCalledWith({
      listSort: "title_asc",
      listColumns: ["tags", "priority"],
      defaultTagIds: ["t2"],
    });
    expect(await within(view()).findByRole("status")).toHaveTextContent("保存しました");
    expect(refresh).toHaveBeenCalled();
  });

  it("保存の失敗とタグなしの表示", async () => {
    vi.mocked(saveDisplaySettingsAction).mockResolvedValue({ status: "error", message: "だめ" });
    setup({ tags: [] });
    expect(within(view()).getByText("タグがまだありません。")).toBeInTheDocument();
    await userEvent.click(within(view()).getByRole("button", { name: "保存" }));
    expect(await within(view()).findByRole("alert")).toHaveTextContent("だめ");
  });
});

describe("FieldsSection", () => {
  const fields = [
    field("a", { type: "select", options: ["DAM", "JOY"], showInList: true }),
    field("b", { hidden: true }),
  ];

  it("項目の種類・選択肢・非表示を出す", () => {
    render(<FieldsSection fields={fields} />);
    expect(screen.getByText("選択肢（1つ）：DAM・JOY")).toBeInTheDocument();
    expect(screen.getByText("（非表示）")).toBeInTheDocument();
    const [showA, , showB] = screen.getAllByRole("checkbox");
    expect(showA).toBeChecked();
    expect(showB).toBeDisabled();
  });

  it("項目がなければ案内、20個あれば追加できない", () => {
    const { unmount } = render(<FieldsSection fields={[]} />);
    expect(screen.getByText("まだ項目がありません。")).toBeInTheDocument();
    unmount();
    render(<FieldsSection fields={Array.from({ length: 20 }, (_, i) => field(String(i)))} />);
    expect(screen.getByRole("button", { name: "＋ 項目を追加" })).toBeDisabled();
  });

  it("選択肢付きの項目を追加する", async () => {
    vi.mocked(createFieldAction).mockResolvedValue(ok);
    render(<FieldsSection fields={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "＋ 項目を追加" }));
    expect(screen.queryByLabelText("選択肢（1行に1つ）")).toBeNull();
    await userEvent.type(screen.getByLabelText("項目名"), "採点機種");
    await userEvent.selectOptions(screen.getByLabelText("種類"), "選択肢（複数）");
    await userEvent.type(screen.getByLabelText("選択肢（1行に1つ）"), "DAM{Enter}{Enter} JOY ");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(createFieldAction).toHaveBeenCalledWith({
      name: "採点機種",
      type: "multi_select",
      options: ["DAM", "JOY"],
    });
    await vi.waitFor(() => expect(screen.queryByLabelText("項目名")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("追加の失敗はメッセージ、やめるで閉じる", async () => {
    vi.mocked(createFieldAction).mockResolvedValue({
      status: "error",
      message: "同じ名前の項目があります",
    });
    render(<FieldsSection fields={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "＋ 項目を追加" }));
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("項目名"), "x");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("同じ名前の項目があります");
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByLabelText("項目名")).toBeNull();
  });

  it("メッセージのないエラーは汎用の文言", async () => {
    vi.mocked(reorderFieldsAction).mockResolvedValue({ status: "error" } as never);
    render(<FieldsSection fields={fields} />);
    await userEvent.click(screen.getByRole("button", { name: "項目aを下へ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("うまくいきませんでした");
  });

  it("一覧に表示・非表示を切り替える", async () => {
    vi.mocked(updateFieldAction).mockResolvedValue(ok);
    render(<FieldsSection fields={fields} />);
    await userEvent.click(screen.getAllByRole("checkbox", { name: "一覧に表示" })[0]);
    expect(updateFieldAction).toHaveBeenLastCalledWith({
      id: "a",
      name: "項目a",
      showInList: false,
      hidden: false,
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    await userEvent.click(screen.getAllByRole("checkbox", { name: "非表示" })[1]);
    expect(updateFieldAction).toHaveBeenLastCalledWith({
      id: "b",
      name: "項目b",
      showInList: false,
      hidden: false,
    });
  });

  it("並べ替え（端のボタンは押せない）", async () => {
    vi.mocked(reorderFieldsAction).mockResolvedValue(ok);
    render(<FieldsSection fields={fields} />);
    expect(screen.getByRole("button", { name: "項目aを上へ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "項目bを下へ" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "項目bを上へ" }));
    expect(reorderFieldsAction).toHaveBeenCalledWith(["b", "a"]);
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "項目aを下へ" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "項目aを下へ" }));
    expect(reorderFieldsAction).toHaveBeenLastCalledWith(["b", "a"]);
  });

  it("名前と選択肢を編集する", async () => {
    vi.mocked(updateFieldAction).mockResolvedValue(ok);
    render(<FieldsSection fields={fields} />);
    await userEvent.click(screen.getAllByRole("button", { name: "編集" })[0]);
    const name = screen.getByLabelText("項目名（選択肢（1つ））");
    await userEvent.clear(name);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    await userEvent.type(name, "機種");
    await userEvent.type(screen.getByLabelText("選択肢（1行に1つ）"), "{Enter}その他");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(updateFieldAction).toHaveBeenCalledWith({
      id: "a",
      name: "機種",
      options: ["DAM", "JOY", "その他"],
      showInList: true,
      hidden: false,
    });
    await vi.waitFor(() => expect(screen.queryByLabelText(/項目名（/)).toBeNull());
  });

  it("選択肢のない項目の編集では options を送らず、やめるで戻る", async () => {
    vi.mocked(updateFieldAction).mockResolvedValue(ok);
    render(<FieldsSection fields={fields} />);
    await userEvent.click(screen.getAllByRole("button", { name: "編集" })[1]);
    expect(screen.queryByLabelText("選択肢（1行に1つ）")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(vi.mocked(updateFieldAction).mock.lastCall![0]).toMatchObject({ options: undefined });
    await userEvent.click(screen.getAllByRole("button", { name: "編集" })[1]);
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByLabelText(/項目名（/)).toBeNull();
  });

  it("削除は確認してから", async () => {
    vi.mocked(deleteFieldAction).mockResolvedValue(ok);
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(<FieldsSection fields={fields} />);
    await userEvent.click(screen.getAllByRole("button", { name: "削除" })[0]);
    expect(deleteFieldAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole("button", { name: "削除" })[0]);
    expect(deleteFieldAction).toHaveBeenCalledWith("a");
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("項目「項目a」を削除しますか？"));
    confirm.mockRestore();
  });
});

describe("DataSection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const file = new File(['{"app":"setlistic"}'], "export.json", { type: "application/json" });
  const choose = async () => {
    const input = screen.getByLabelText("インポート（JSON）");
    await userEvent.upload(input, file);
    return input as HTMLInputElement;
  };
  const respond = (body: unknown, ok = true) => ({ ok, json: async () => body });

  it("エクスポートのリンクを出す", () => {
    render(<DataSection />);
    expect(screen.getByRole("link", { name: "JSONでエクスポート" })).toHaveAttribute(
      "href",
      "/api/export?format=json",
    );
    expect(screen.getByRole("link", { name: "CSVでエクスポート" })).toHaveAttribute(
      "href",
      "/api/export?format=csv",
    );
    expect(screen.getByRole("button", { name: "取り込む" })).toBeDisabled();
  });

  it("選んだファイルを取り込み、結果と警告を出す", async () => {
    fetchMock.mockResolvedValue(
      respond({
        ok: true,
        result: { songs_added: 3, songs_skipped: 1, tags_added: 2, fields_added: 0 },
        warnings: ["タグが長すぎるので捨てました"],
      }),
    );
    render(<DataSection />);
    const input = await choose();
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "曲 3件を追加（1件は登録済みのためスキップ）、タグ 2件、項目 0件を追加。",
    );
    expect(status).toHaveTextContent("タグが長すぎるので捨てました");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import",
      expect.objectContaining({ method: "POST" }),
    );
    expect((fetchMock.mock.calls[0][1].body as FormData).get("file")).toBeInstanceOf(File);
    expect(input.value).toBe("");
    expect(refresh).toHaveBeenCalled();
  });

  it("スキップも警告もなければその部分を出さない", async () => {
    fetchMock.mockResolvedValue(
      respond({
        ok: true,
        result: { songs_added: 1, songs_skipped: 0, tags_added: 0, fields_added: 0 },
        warnings: [],
      }),
    );
    render(<DataSection />);
    await choose();
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    const status = await screen.findByRole("status");
    expect(status).not.toHaveTextContent("スキップ");
    expect(within(status).queryByRole("list")).toBeNull();
  });

  it("サーバーのエラー・通信の失敗を出す", async () => {
    fetchMock
      .mockResolvedValueOnce(respond({ ok: false, error: "JSONとして読み取れませんでした" }, false))
      .mockRejectedValueOnce(new Error("offline"));
    render(<DataSection />);
    await choose();
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("JSONとして読み取れませんでした");
    expect(refresh).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("通信に失敗しました");
  });
});

describe("DangerSection", () => {
  it("「削除」と入力するまで削除できず、失敗したらメッセージ", async () => {
    vi.mocked(deleteAccountAction).mockResolvedValue({
      status: "error",
      message: "削除できませんでした",
    });
    render(<DangerSection />);
    await userEvent.click(screen.getByRole("button", { name: "アカウントを削除" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    const go = within(dialog).getByRole("button", { name: "削除する" });
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("確認のため「削除」と入力"), "削除");
    await userEvent.click(go);
    expect(deleteAccountAction).toHaveBeenCalledWith("削除");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("削除できませんでした");
  });

  it("成功時（リダイレクトされる）は何も出さない。キャンセルで閉じ、開き直すと入力は空", async () => {
    vi.mocked(deleteAccountAction).mockResolvedValue(undefined as never);
    render(<DangerSection />);
    await userEvent.click(screen.getByRole("button", { name: "アカウントを削除" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("確認のため「削除」と入力");
    await userEvent.type(input, "削除");
    await userEvent.click(within(dialog).getByRole("button", { name: "削除する" }));
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(dialog).not.toHaveAttribute("open");
    await userEvent.click(screen.getByRole("button", { name: "アカウントを削除" }));
    expect(input).toHaveValue("");
  });
});
