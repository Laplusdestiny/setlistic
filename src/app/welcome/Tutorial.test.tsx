// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./actions", () => ({
  completeTutorialAction: vi.fn(),
  registerFirstSongAction: vi.fn(),
}));

import { completeTutorialAction, registerFirstSongAction } from "./actions";
import { Tutorial } from "./Tutorial";

const SONG = { id: "s1", title: "夜に駆ける", artist: "YOASOBI" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(completeTutorialAction).mockResolvedValue();
});

/** ホーム画面から起動している状態（iOS Safari の navigator.standalone）にする */
function standalone(on: boolean) {
  Object.defineProperty(window.navigator, "standalone", { value: on, configurable: true });
}
afterEach(() => standalone(false));

describe("Tutorial", () => {
  it("ようこそ：手順の番号を読み上げ用にも出し、見出しにフォーカスする", async () => {
    const user = userEvent.setup();
    render(<Tutorial step="welcome" song={null} />);
    expect(screen.getByLabelText("ステップ 1 / 4")).toHaveTextContent("STEP 01 / 04");
    const h = screen.getByRole("heading", { level: 1 });
    expect(h).toHaveTextContent("ようこそ、Setlisticへ");
    expect(h).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "はじめる" }));
    expect(router.push).toHaveBeenCalledWith("/welcome?step=home");
  });

  it("ホーム画面に追加：ヘルプの節を新しいタブで開き、次へ進む", async () => {
    const user = userEvent.setup();
    render(<Tutorial step="home" song={null} />);
    expect(screen.getByText("STEP 02 / 04")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /追加の方法を見る/ });
    expect(link).toHaveAttribute("href", "/help#home-screen");
    expect(link).toHaveAttribute("target", "_blank");
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(router.push).toHaveBeenCalledWith("/welcome?step=register");
  });

  it("ホーム画面から起動しているときは「ホーム画面に追加」を飛ばし、番号を詰める", async () => {
    standalone(true);
    const user = userEvent.setup();
    const { unmount } = render(<Tutorial step="welcome" song={null} />);
    expect(screen.getByText("STEP 01 / 03")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "はじめる" }));
    expect(router.push).toHaveBeenCalledWith("/welcome?step=register");
    unmount();

    render(<Tutorial step="home" song={null} />);
    expect(router.replace).toHaveBeenCalledWith("/welcome?step=register");
  });

  it("スキップで完了を記録してから曲一覧へ", async () => {
    const user = userEvent.setup();
    render(<Tutorial step="welcome" song={null} />);
    await user.click(screen.getByRole("button", { name: "スキップ" }));
    expect(completeTutorialAction).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("1曲登録：空欄では押せず、登録できたら完了の手順へ", async () => {
    vi.mocked(registerFirstSongAction).mockResolvedValue({ status: "ok", id: "s9" });
    const user = userEvent.setup();
    render(<Tutorial step="register" song={null} />);
    expect(screen.getByText("STEP 03 / 04")).toBeInTheDocument();
    expect(screen.getByText(/Apple Music・Spotify・YouTube Music に対応/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "登録する" });
    expect(submit).toBeDisabled();

    const input = screen.getByLabelText("曲のリンク");
    expect(input).toHaveAttribute("type", "url");
    await user.type(input, "https://music.apple.com/jp/song/x/1");
    await user.click(submit);
    expect(registerFirstSongAction).toHaveBeenCalledWith("https://music.apple.com/jp/song/x/1");
    expect(router.push).toHaveBeenCalledWith("/welcome?step=done&song=s9");
  });

  it("1曲登録：失敗したら理由とヘルプへのリンクを出してその場に留まる", async () => {
    vi.mocked(registerFirstSongAction).mockResolvedValue({
      status: "error",
      message: "曲のURLではないようです。",
    });
    const user = userEvent.setup();
    render(<Tutorial step="register" song={null} />);
    const input = screen.getByLabelText("曲のリンク");
    await user.type(input, "https://example.com{Enter}");
    expect(await screen.findByText("曲のURLではないようです。")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("link", { name: "対応サービスについて" })).toHaveAttribute(
      "href",
      "/help#services",
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("1曲登録：「あとで登録する」は完了を記録して曲一覧へ", async () => {
    const user = userEvent.setup();
    render(<Tutorial step="register" song={null} />);
    await user.click(screen.getByRole("button", { name: "あとで登録する" }));
    expect(completeTutorialAction).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("完了：登録した曲を出し、タグの編集と曲一覧へのリンクを置く（スキップは出さない）", async () => {
    render(<Tutorial step="done" song={SONG} />);
    await act(async () => {});
    expect(screen.getByText("STEP 04 / 04")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "スキップ" })).not.toBeInTheDocument();
    expect(screen.getByText("夜に駆ける")).toBeInTheDocument();
    expect(screen.getByText("YOASOBI")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "タグを付ける" })).toHaveAttribute(
      "href",
      "/songs/s1?edit=1",
    );
    expect(screen.getByRole("link", { name: "この曲にタグを付ける" })).toHaveAttribute(
      "href",
      "/songs/s1?edit=1",
    );
    expect(screen.getByRole("link", { name: "曲一覧へ" })).toHaveAttribute("href", "/");
  });
});
