// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteRow } from "@/lib/invites";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ addInviteAction: vi.fn(), revokeInviteAction: vi.fn() }));

import { addInviteAction, revokeInviteAction } from "./actions";
import { InvitesScreen } from "./InvitesScreen";

const row = (over: Partial<InviteRow>): InviteRow => ({
  emailHash: "abcdef0123",
  label: null,
  invitedAt: "2026-10-01T00:00:00Z",
  userId: null,
  lastSignInAt: null,
  isSelf: false,
  ...over,
});
const invites = [
  row({ emailHash: "self00", label: "自分", userId: "u0", isSelf: true }),
  row({ emailHash: "pend01", label: "大学の友人" }),
  row({ emailHash: "actv02", userId: "u2", lastSignInAt: "2026-10-10T12:00:00Z" }),
  row({ emailHash: "actv03", label: "同僚", userId: "u3" }),
];

let confirm: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  confirm.mockRestore();
  // navigator.share / clipboard の差し替えを戻す
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

const list = () =>
  screen.getByRole("heading", { name: /招待した人/ }).closest("section") as HTMLElement;

describe("InvitesScreen: 一覧", () => {
  it("状態ごとの表示と操作。自分は取り消せない", () => {
    render(<InvitesScreen invites={invites} />);
    expect(screen.getByRole("heading", { name: "招待した人（4）" })).toBeInTheDocument();
    const items = within(list()).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("あなた");
    expect(within(items[0]).queryByRole("button")).toBeNull();
    expect(items[1]).toHaveTextContent("まだログインしていません");
    expect(items[1]).toHaveTextContent("招待日 2026/10/1 ／ 識別 pend01");
    expect(within(items[1]).getByRole("button", { name: "招待を取り消す" })).toBeInTheDocument();
    expect(items[2]).toHaveTextContent("（メモなし）");
    expect(items[2]).toHaveTextContent("利用中（最終ログイン 2026/10/10）");
    expect(items[3]).toHaveTextContent(/利用中招待日/);
    expect(within(items[3]).getByRole("button", { name: "アクセスを止める" })).toBeInTheDocument();
  });

  it("まだ誰も招待していなければその旨", () => {
    render(<InvitesScreen invites={[]} />);
    expect(screen.getByText("まだ招待していません。")).toBeInTheDocument();
  });

  it("招待の取り消しは確認してから", async () => {
    vi.mocked(revokeInviteAction).mockResolvedValue({ status: "ok" });
    confirm.mockReturnValueOnce(false);
    render(<InvitesScreen invites={invites} />);
    const btn = screen.getByRole("button", { name: "招待を取り消す" });
    await userEvent.click(btn);
    expect(revokeInviteAction).not.toHaveBeenCalled();
    await userEvent.click(btn);
    expect(confirm).toHaveBeenLastCalledWith("「大学の友人」 の招待を取り消しますか？");
    expect(revokeInviteAction).toHaveBeenCalledWith({ hash: "pend01", deleteUser: false });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("アクセスを止めるとアカウントごと消す（メモがなければ識別子で確認）", async () => {
    vi.mocked(revokeInviteAction).mockResolvedValue({
      status: "error",
      message: "この操作は管理者だけができます。",
    });
    render(<InvitesScreen invites={invites} />);
    await userEvent.click(screen.getAllByRole("button", { name: "アクセスを止める" })[0]);
    expect(confirm).toHaveBeenLastCalledWith(
      expect.stringMatching(/^識別 actv02 のアクセスを止めます/),
    );
    expect(revokeInviteAction).toHaveBeenCalledWith({ hash: "actv02", deleteUser: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("この操作は管理者だけができます。");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("InvitesScreen: 招待する", () => {
  async function invite() {
    await userEvent.type(screen.getByLabelText("メールアドレス"), "friend@example.com");
    await userEvent.type(screen.getByLabelText("メモ（任意・自分用の目印）"), "大学");
    await userEvent.click(screen.getByRole("button", { name: "招待する" }));
  }

  it("メールとメモで招待し、相手に送る案内文を出す", async () => {
    vi.mocked(addInviteAction).mockResolvedValue({ status: "ok" });
    render(<InvitesScreen invites={[]} />);
    expect(screen.getByRole("button", { name: "招待する" })).toBeDisabled();
    await invite();
    expect(addInviteAction).toHaveBeenCalledWith({ email: "friend@example.com", label: "大学" });
    const done = await screen.findByRole("status");
    const message = within(done).getByLabelText("相手に送る案内文");
    expect((message as HTMLTextAreaElement).value).toContain(
      `こちらを開いてください：${window.location.origin}`,
    );
    expect(screen.getByLabelText("メールアドレス")).toHaveValue("");
    expect(refresh).toHaveBeenCalled();
    // share に対応していない端末では共有ボタンを出さない
    expect(within(done).queryByRole("button", { name: "共有する" })).toBeNull();
  });

  it("案内文をコピーする（失敗したら元の表示のまま）", async () => {
    vi.mocked(addInviteAction).mockResolvedValue({ status: "ok" });
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("denied"));
    render(<InvitesScreen invites={[]} />);
    await invite();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await userEvent.click(await screen.findByRole("button", { name: "案内文をコピー" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Setlistic"));
    expect(screen.getByRole("button", { name: "コピーしました" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "コピーしました" }));
    expect(screen.getByRole("button", { name: "案内文をコピー" })).toBeInTheDocument();
  });

  it("共有に対応した端末では共有シートを開く（キャンセルは無視）", async () => {
    vi.mocked(addInviteAction).mockResolvedValue({ status: "ok" });
    const share = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("AbortError"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<InvitesScreen invites={[]} />);
    await invite();
    const btn = await screen.findByRole("button", { name: "共有する" });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(share).toHaveBeenCalledTimes(2);
    expect(share).toHaveBeenCalledWith({ text: expect.stringContaining("招待しました") });
  });

  it("招待の失敗はメッセージ", async () => {
    vi.mocked(addInviteAction).mockResolvedValue({
      status: "error",
      message: "メールアドレスの形式が正しくありません",
    });
    render(<InvitesScreen invites={[]} />);
    await invite();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "メールアドレスの形式が正しくありません",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
