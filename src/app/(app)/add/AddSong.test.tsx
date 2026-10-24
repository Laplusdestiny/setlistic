// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomField } from "@/lib/custom-fields";
import type { SongDraft } from "@/lib/songs/types";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./actions", () => ({
  lookupFromUrl: vi.fn(),
  saveSongAction: vi.fn(),
  searchSongsAction: vi.fn(),
  lookupManyAction: vi.fn(),
  saveManyAction: vi.fn(),
}));

import {
  lookupFromUrl,
  lookupManyAction,
  saveManyAction,
  saveSongAction,
  searchSongsAction,
} from "./actions";
import { AddSong } from "./AddSong";
import { BulkAdd } from "./BulkAdd";
import { SearchPanel } from "./SearchPanel";
import type { LookupResult } from "./types";

const URL1 = "https://music.apple.com/jp/song/x/1";
const draft = (over: Partial<SongDraft> = {}): SongDraft => ({
  appleTrackId: 1,
  title: "夜に駆ける",
  artist: "YOASOBI",
  album: "THE BOOK",
  genre: "J-Pop",
  artworkUrl: null,
  durationMs: null,
  releaseDate: null,
  appleUrl: null,
  sourceService: "apple_music",
  sourceUrl: URL1,
  ...over,
});
const tags = [
  { id: "t1", name: "十八番", groupId: null },
  { id: "t2", name: "アニソン", groupId: null },
];
const fields: CustomField[] = [
  {
    id: "f1",
    name: "音域",
    type: "text",
    options: [],
    sortOrder: 0,
    showInList: false,
    hidden: false,
  },
];

function setup(over: Partial<Parameters<typeof AddSong>[0]> = {}) {
  render(
    <AddSong
      initialUrl=""
      groups={[]}
      tags={tags}
      defaultTagIds={["t1"]}
      fields={fields}
      quota={{ used: 1, max: 500 }}
      {...over}
    />,
  );
}

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  vi.mocked(lookupFromUrl).mockReset();
  vi.mocked(saveSongAction).mockReset();
});

async function fetchFromUrl(res: LookupResult = { status: "ok", draft: draft(), duplicate: null }) {
  vi.mocked(lookupFromUrl).mockResolvedValue(res);
  // 共有URLは貼り付けで入る（1文字ずつ打つと遅く、負荷が高いと待ち時間を超える）
  await userEvent.click(screen.getByLabelText("共有URL"));
  await userEvent.paste(URL1);
  await userEvent.click(screen.getByRole("button", { name: "曲情報を取得" }));
}

describe("AddSong: URL から", () => {
  it("共有 URL を認識し、取得した曲を確認画面に出す（ジャンルを新規タグとして提案）", async () => {
    setup();
    expect(screen.getByRole("button", { name: "曲情報を取得" })).toBeDisabled();
    await fetchFromUrl();
    expect(screen.getByText("✓ Apple Music のURLを認識")).toBeInTheDocument();
    expect(lookupFromUrl).toHaveBeenCalledWith(URL1);
    expect(await screen.findByRole("heading", { name: "内容を確認" })).toBeInTheDocument();
    expect(screen.getByText("Apple Music から取得")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "#十八番" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "#J-Pop（新規タグ）を外す" })).toBeInTheDocument();
  });

  it("ジャンルと同じ名前のタグがあればそれを選ぶ", async () => {
    setup({ tags: [...tags, { id: "t3", name: "j-pop", groupId: null }] });
    await fetchFromUrl();
    expect(await screen.findByRole("button", { name: "#j-pop" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("取得エラーは理由に合ったメッセージを出し、入力し直すと消える", async () => {
    setup();
    await fetchFromUrl({ status: "error", reason: "unsupported_service", service: "spotify" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Spotify のURLにはまだ対応していません",
    );
    await userEvent.type(screen.getByLabelText("共有URL"), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ペーストボタンでクリップボードから貼る（使えない端末では何もしない）", async () => {
    setup();
    const readText = vi.fn().mockResolvedValueOnce(URL1).mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
    await userEvent.click(screen.getByRole("button", { name: "ペースト" }));
    expect(screen.getByLabelText("共有URL")).toHaveValue(URL1);
    await userEvent.click(screen.getByRole("button", { name: "ペースト" }));
    expect(screen.getByLabelText("共有URL")).toHaveValue(URL1);
  });

  it("登録済みの曲は警告を出し、保存できない", async () => {
    setup();
    await fetchFromUrl({
      status: "ok",
      draft: draft(),
      duplicate: { id: "s1", title: "夜に駆ける" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("すでにセトリに登録されています");
    // 取得の非同期トランジションが終わるまで、ボタンは「保存中…」のまま。名前が戻るのを待つ
    expect(await screen.findByRole("button", { name: "セトリに追加" })).toBeDisabled();
  });

  it("戻るで入力に戻る", async () => {
    setup();
    await fetchFromUrl();
    await userEvent.click(await screen.findByRole("button", { name: "戻る" }));
    expect(await screen.findByRole("heading", { name: "曲を登録" })).toBeInTheDocument();
  });
});

describe("AddSong: 保存", () => {
  it("キー・メモ・項目・タグを付けて保存し、セトリへ戻る", async () => {
    vi.mocked(saveSongAction).mockResolvedValue({ status: "ok", id: "new" });
    setup();
    await fetchFromUrl();
    await screen.findByRole("heading", { name: "内容を確認" });
    await userEvent.click(screen.getByRole("button", { name: "キーを下げる" }));
    await userEvent.type(screen.getByLabelText("メモ"), "低め");
    await userEvent.type(screen.getByLabelText("音域"), "高");
    await userEvent.click(screen.getByRole("button", { name: "#アニソン" }));
    await userEvent.click(screen.getByRole("button", { name: "#十八番" }));
    await userEvent.type(screen.getByLabelText("新しいタグ"), "アニソン{Enter}");
    await userEvent.type(screen.getByLabelText("新しいタグ"), "新{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "#新（新規タグ）を外す" }));
    await userEvent.click(screen.getByRole("button", { name: "曲名・アーティストを修正" }));
    await userEvent.type(screen.getByLabelText("アーティスト"), "!");
    await userEvent.type(screen.getByLabelText("曲名"), "?");
    await userEvent.click(screen.getByRole("button", { name: "セトリに追加" }));

    expect(saveSongAction).toHaveBeenCalledWith({
      draft: draft({ title: "夜に駆ける?", artist: "YOASOBI!" }),
      songKey: -1,
      memo: "低め",
      fields: { f1: "高" },
      tagIds: ["t2"],
      newTags: [{ name: "J-Pop", group: "ジャンル" }],
    });
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
    expect(router.refresh).toHaveBeenCalled();
  });

  // cacheComponents では画面が Activity で隠されるだけで state が残る。
  // 次に開いたとき前の曲の確認画面が出ないよう、移動前に入力を空に戻す（Issue #28）
  it("セトリに追加したあとは入力を空に戻してから移動する", async () => {
    vi.mocked(saveSongAction).mockResolvedValue({ status: "ok", id: "new" });
    setup();
    await fetchFromUrl();
    await userEvent.type(await screen.findByLabelText("メモ"), "低め");
    await userEvent.click(await screen.findByRole("button", { name: "セトリに追加" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/"), { timeout: 3000 });
    // reset と移動は同じトランジションの中で呼ばれる。push はモックなので先に記録され、
    // 画面の再描画はそのあとに確定するため、見出しは findBy で待つ
    expect(await screen.findByRole("heading", { name: "曲を登録" })).toBeInTheDocument();
    expect(screen.getByLabelText("共有URL")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("キャンセルしたときも入力を空に戻す", async () => {
    setup();
    await fetchFromUrl();
    await userEvent.click(await screen.findByRole("link", { name: "キャンセル" }));
    expect(await screen.findByRole("heading", { name: "曲を登録" })).toBeInTheDocument();
    expect(screen.getByLabelText("共有URL")).toHaveValue("");
  });

  it("保存して続けて登録すると、入力欄に戻ってメッセージを出す", async () => {
    vi.mocked(saveSongAction).mockResolvedValue({ status: "ok", id: "new" });
    setup();
    await fetchFromUrl();
    await userEvent.click(await screen.findByRole("button", { name: "保存して続けて登録" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "「夜に駆ける」を追加しました。続けて登録できます。",
    );
    expect(screen.getByLabelText("共有URL")).toHaveValue("");
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "limit" }, "上限（500曲）に達しました"],
    [{ status: "duplicate" }, "すでにセトリに登録されています"],
    [{ status: "error", message: "保存できませんでした" }, "保存できませんでした"],
  ] as const)("保存の結果 %o を表示する", async (res, text) => {
    vi.mocked(saveSongAction).mockResolvedValue(res as never);
    setup();
    await fetchFromUrl();
    await userEvent.click(await screen.findByRole("button", { name: "セトリに追加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("上限が不明なら 0 曲として案内する", async () => {
    vi.mocked(saveSongAction).mockResolvedValue({ status: "limit" });
    setup({ quota: null });
    await fetchFromUrl();
    await userEvent.click(await screen.findByRole("button", { name: "セトリに追加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("上限（0曲）");
  });
});

describe("AddSong: その他の登録方法", () => {
  it("手入力は空のフォームから始め、曲名とアーティストが入るまで保存できない", async () => {
    setup({ fields: [] });
    await userEvent.click(screen.getByRole("button", { name: /手入力/ }));
    expect(screen.queryByText("Apple Music から取得")).toBeNull();
    const add = screen.getByRole("button", { name: "セトリに追加" });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText("曲名"), "自作曲");
    await userEvent.type(screen.getByLabelText("アーティスト"), "自分");
    expect(add).toBeEnabled();
  });

  it("曲名で探すパネルから選んだ曲を確認画面に出す", async () => {
    vi.mocked(searchSongsAction).mockResolvedValue({
      status: "ok",
      results: [{ ...draft({ genre: null }), duplicate: false }],
    });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /曲名で探す/ }));
    await userEvent.type(screen.getByLabelText("曲名・アーティスト名で探す"), "夜に");
    await userEvent.click(
      await screen.findByRole("button", { name: /夜に駆ける/ }, { timeout: 3000 }),
    );
    expect(screen.getByText("Apple Music の検索結果から選択")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /URLから/ }));
    expect(screen.getByLabelText("共有URL")).toBeInTheDocument();
  });

  it("まとめて登録に切り替える", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "まとめて登録" }));
    expect(screen.getByLabelText("共有URL（改行区切り）")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "1曲ずつ" }));
    expect(screen.getByLabelText("共有URL")).toBeInTheDocument();
  });

  it("上限が近い・達したときに案内を出す", () => {
    setup({ quota: { used: 460, max: 500 } });
    expect(screen.getByRole("status")).toHaveTextContent("あと40曲です");
  });

  it("上限に達していれば保存できない", async () => {
    setup({ quota: { used: 500, max: 500 } });
    expect(screen.getByRole("alert")).toHaveTextContent("上限（500曲）に達しました");
    await userEvent.click(screen.getByRole("button", { name: /手入力/ }));
    await userEvent.type(screen.getByLabelText("曲名"), "a");
    await userEvent.type(screen.getByLabelText("アーティスト"), "b");
    expect(screen.getByRole("button", { name: "セトリに追加" })).toBeDisabled();
  });

  it("共有から開いたときは URL が入った状態", () => {
    setup({ initialUrl: URL1 });
    expect(screen.getByLabelText("共有URL")).toHaveValue(URL1);
  });
});

describe("SearchPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(searchSongsAction).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const type = (v: string) =>
    fireEvent.change(screen.getByLabelText("曲名・アーティスト名で探す"), { target: { value: v } });

  it("入力が止まってから検索し、登録済みは選べない", async () => {
    vi.mocked(searchSongsAction).mockResolvedValue({
      status: "ok",
      results: [
        { ...draft(), duplicate: true },
        { ...draft({ appleTrackId: 2, title: "群青", album: null }), duplicate: false },
      ],
    });
    const onPick = vi.fn();
    render(<SearchPanel onPick={onPick} />);
    type("夜");
    await act(async () => vi.advanceTimersByTime(1000));
    expect(searchSongsAction).not.toHaveBeenCalled();
    type("YOASOBI");
    await act(async () => vi.advanceTimersByTime(700));
    expect(searchSongsAction).toHaveBeenCalledWith("YOASOBI");
    const list = await screen.findByRole("list");
    expect(within(list).getByRole("button", { name: /夜に駆ける/ })).toBeDisabled();
    expect(within(list).getByText("YOASOBI ／ THE BOOK")).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: /群青/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ title: "群青" }));
  });

  it("結果なし・エラーの案内", async () => {
    vi.mocked(searchSongsAction)
      .mockResolvedValueOnce({ status: "ok", results: [] })
      .mockResolvedValueOnce({ status: "error", reason: "network" });
    render(<SearchPanel onPick={() => {}} />);
    type("ない曲");
    await act(async () => vi.advanceTimersByTime(700));
    expect(await screen.findByText(/見つかりませんでした/)).toBeInTheDocument();
    type("ない曲2");
    // 前回の呼び出しから 3.2 秒あける（API の呼び出し回数の目安を守る）
    await act(async () => vi.advanceTimersByTime(3200));
    expect(await screen.findByText(/検索できませんでした/)).toBeInTheDocument();
  });

  it("短くした入力では古い応答を捨てる", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(searchSongsAction).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    render(<SearchPanel onPick={() => {}} />);
    type("夜に");
    await act(async () => vi.advanceTimersByTime(700));
    expect(screen.getByText("検索中…")).toBeInTheDocument();
    type("夜");
    await act(async () => resolve({ status: "ok", results: [{ ...draft(), duplicate: false }] }));
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("検索中…")).toBeNull();
  });
});

describe("BulkAdd", () => {
  const ok = (
    id: number,
    title: string,
    duplicate = null as { id: string; title: string } | null,
  ) => ({
    input: `https://music.apple.com/jp/song/x/${id}`,
    result: { status: "ok" as const, draft: draft({ appleTrackId: id, title }), duplicate },
  });

  beforeEach(() => {
    vi.mocked(lookupManyAction).mockReset();
    vi.mocked(saveManyAction).mockReset();
  });

  function setupBulk(remaining: number | null = null) {
    render(<BulkAdd groups={[]} tags={tags} defaultTagIds={["t1"]} remaining={remaining} />);
    return screen.getByLabelText("共有URL（改行区切り）");
  }

  it("貼り付けた URL を取得し、取り込める曲だけ最初から選ぶ", async () => {
    vi.mocked(lookupManyAction).mockResolvedValue([
      ok(1, "A"),
      ok(2, "B", { id: "s", title: "B" }),
      {
        input: "https://open.spotify.com/track/x",
        result: { status: "error", reason: "unsupported_service", service: "spotify" },
      },
      {
        input: "https://music.apple.com/jp/song/x/1",
        result: { status: "error", reason: "not_found" },
        repeated: true,
      },
    ]);
    vi.mocked(saveManyAction).mockResolvedValue([{ title: "A", status: "ok", id: "new-a" }]);
    const area = setupBulk();
    expect(screen.getByRole("button", { name: "0件の曲情報を取得" })).toBeDisabled();
    fireEvent.change(area, {
      target: { value: "メモ https://a.example/1\nhttps://a.example/2 x" },
    });
    await userEvent.click(screen.getByRole("button", { name: "2件の曲情報を取得" }));
    expect(lookupManyAction).toHaveBeenCalledWith(["https://a.example/1", "https://a.example/2"]);

    const boxes = await screen.findAllByRole("checkbox");
    expect(
      boxes.map((b) => [(b as HTMLInputElement).checked, (b as HTMLInputElement).disabled]),
    ).toEqual([
      [true, false],
      [false, true],
      [false, true],
      [false, true],
    ]);
    expect(screen.getByText(/登録済みのためスキップ/)).toBeInTheDocument();
    expect(screen.getByText(/Spotify のURL/)).toBeInTheDocument();
    expect(screen.getByText("同じ曲が上にあるためスキップ")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "#十八番" }));
    await userEvent.click(screen.getByRole("button", { name: "#アニソン" }));
    await userEvent.type(screen.getByLabelText("新しいタグ"), "十八番{Enter}新{Enter}消{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "#消（新規タグ）を外す" }));
    await userEvent.click(screen.getByRole("button", { name: "選んだ1曲をセトリに追加" }));
    expect(saveManyAction).toHaveBeenCalledWith(
      [draft({ appleTrackId: 1, title: "A" })],
      ["t2", "t1"],
      [{ name: "新" }],
    );
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("1曲を追加しました。");
    expect(
      within(status).getByRole("link", { name: "登録した曲のタグをまとめて変更" }),
    ).toHaveAttribute("href", "/bulk?ids=new-a");
    expect(area).toHaveValue("");
  });

  it("チェックを外すと保存できず、上限を超える選択は止める", async () => {
    vi.mocked(lookupManyAction).mockResolvedValue([ok(1, "A"), ok(2, "B")]);
    const area = setupBulk(1);
    fireEvent.change(area, { target: { value: "https://a.example/1 https://a.example/2" } });
    await userEvent.click(screen.getByRole("button", { name: "2件の曲情報を取得" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("あと1曲です");
    expect(screen.getByRole("button", { name: "選んだ2曲をセトリに追加" })).toBeDisabled();
    const [a, b] = screen.getAllByRole("checkbox");
    await userEvent.click(a);
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(b);
    expect(screen.getByRole("button", { name: "選んだ0曲をセトリに追加" })).toBeDisabled();
  });

  it("21件以上は先頭20件だけ取得し、案内を出す", () => {
    const area = setupBulk();
    const many = Array.from({ length: 21 }, (_, i) => `https://a.example/${i}`).join("\n");
    fireEvent.change(area, { target: { value: many } });
    expect(screen.getByRole("button", { name: "20件の曲情報を取得" })).toBeInTheDocument();
    expect(screen.getByText(/20件を超えた分は取得しません/)).toBeInTheDocument();
  });

  it("保存できなかった曲・上限で止まった曲を伝える", async () => {
    vi.mocked(lookupManyAction).mockResolvedValue([ok(1, "A"), ok(2, "B")]);
    vi.mocked(saveManyAction).mockResolvedValue([
      { title: "A", status: "duplicate" },
      { title: "B", status: "limit" },
    ]);
    const area = setupBulk();
    fireEvent.change(area, { target: { value: "https://a.example/1 https://a.example/2" } });
    await userEvent.click(screen.getByRole("button", { name: "2件の曲情報を取得" }));
    await userEvent.click(await screen.findByRole("button", { name: "選んだ2曲をセトリに追加" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      "0曲を追加しました。（2曲は登録済み、または保存できませんでした）",
    );
    expect(status).toHaveTextContent("曲数の上限に達したため");
    expect(within(status).queryByRole("link", { name: /まとめて変更/ })).toBeNull();
  });
});
