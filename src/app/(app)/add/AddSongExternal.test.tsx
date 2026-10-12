// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongDraft } from "@/lib/songs/types";

// Spotify / YouTube Music の共有URLから登録するときの画面（#16）

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  lookupFromUrl: vi.fn(),
  saveSongAction: vi.fn(),
  searchSongsAction: vi.fn(),
  lookupManyAction: vi.fn(),
  saveManyAction: vi.fn(),
}));

import { lookupFromUrl, lookupManyAction, saveSongAction } from "./actions";
import { AddSong } from "./AddSong";
import { BulkAdd } from "./BulkAdd";
import type { Candidate, ExternalInfo, LookupResult } from "./types";

const SPOTIFY = "https://open.spotify.com/track/364JzOajs76bJymjHm3sVY";
const YOUTUBE = "https://music.youtube.com/watch?v=Pmgc40BUVaI";

const apple = (id: number, title: string, genre: string | null, over: Partial<SongDraft> = {}) => ({
  appleTrackId: id,
  title,
  artist: "米津玄師",
  album: "BOOTLEG",
  genre,
  artworkUrl: null,
  durationMs: null,
  releaseDate: null,
  appleUrl: null,
  sourceService: "spotify" as const,
  sourceUrl: SPOTIFY,
  ...over,
});
const sourceDraft: SongDraft = {
  ...apple(0, "ピースサイン - Peace Sign", null),
  appleTrackId: null,
  album: null,
};
const cand = (draft: SongDraft, duplicate: Candidate["duplicate"] = null): Candidate => ({
  draft,
  duplicate,
});

function external(over: Partial<ExternalInfo>): ExternalInfo {
  return {
    service: "spotify",
    confidence: "confident",
    source: cand(sourceDraft),
    candidates: [],
    itunesFailed: false,
    ...over,
  };
}
function ok(draft: SongDraft, ext: ExternalInfo, duplicate: Candidate["duplicate"] = null) {
  return { status: "ok", draft, duplicate, external: ext } satisfies LookupResult;
}

const tags = [
  { id: "t1", name: "十八番", groupId: null },
  { id: "t3", name: "j-pop", groupId: null },
];

function setup(defaultTagIds = ["t1"]) {
  render(
    <AddSong
      initialUrl=""
      groups={[]}
      tags={tags}
      defaultTagIds={defaultTagIds}
      fields={[]}
      quota={null}
    />,
  );
}
async function fetchFrom(url: string, res: LookupResult) {
  vi.mocked(lookupFromUrl).mockResolvedValue(res);
  await userEvent.click(screen.getByLabelText("共有URL"));
  await userEvent.paste(url);
  await userEvent.click(screen.getByRole("button", { name: "曲情報を取得" }));
  await screen.findByRole("heading", { name: "内容を確認" });
}
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

beforeEach(() => vi.clearAllMocks());

describe("AddSong: Spotify / YouTube Music", () => {
  it("Spotify・YouTube Music の URL を認識する", () => {
    setup();
    const box = screen.getByLabelText("共有URL");
    fireEvent.change(box, { target: { value: SPOTIFY } });
    expect(screen.getByText("✓ Spotify のURLを認識")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: YOUTUBE } });
    expect(screen.getByText("✓ YouTube Music のURLを認識")).toBeInTheDocument();
  });

  it("確信をもって一致したら、Apple Music の表記にそろえたことだけを伝える", async () => {
    setup();
    const best = apple(1, "ピースサイン", "J-Pop");
    await fetchFrom(SPOTIFY, ok(best, external({ confidence: "confident" })));
    expect(screen.getByText("Spotify から取得し、Apple Music の表記にそろえました")).toBeVisible();
    expect(screen.queryByRole("group", { name: "どの曲として登録しますか？" })).toBeNull();
    expect(screen.getByText("ピースサイン")).toBeInTheDocument();
    // ジャンルと同じ名前のタグがあれば、それを選ぶ
    expect(pressed("#j-pop")).toBe("true");
  });

  it.each([
    [
      false,
      "Apple Music で該当する曲が見つからなかったため、YouTube Music の表記で入力しています。",
    ],
    [true, "Apple Music の曲情報を検索できなかったため、YouTube Music の表記で入力しています。"],
  ])("見つからなければ取得元の表記で入力欄を開く（iTunes 失敗=%s）", async (itunesFailed, text) => {
    setup();
    const yt = {
      ...sourceDraft,
      title: "Space Sonic",
      artist: "ELLEGARDEN",
      sourceService: "youtube_music" as const,
    };
    await fetchFrom(
      YOUTUBE,
      ok(
        yt,
        external({
          service: "youtube_music",
          confidence: "not_found",
          source: cand(yt),
          itunesFailed,
        }),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(text);
    expect(screen.getByText("YouTube Music の表記のまま")).toBeInTheDocument();
    expect(screen.getByLabelText("曲名")).toHaveValue("Space Sonic");
    expect(screen.getByLabelText("アーティスト")).toHaveValue("ELLEGARDEN");
  });

  describe("要確認の候補を選ぶ", () => {
    const jpop = apple(1, "ピースサイン", "J-Pop");
    const rock = apple(2, "ピースサイン (Live)", "Rock", { album: null });
    const dupe = apple(3, "Peace Sign", null);
    const ext = external({
      confidence: "needs_confirmation",
      candidates: [cand(jpop), cand(rock), cand(dupe, { id: "s9", title: "Peace Sign" })],
    });
    const radio = (name: RegExp) => screen.getByRole("radio", { name });

    it("候補と取得元の表記を並べ、最初の候補を選んでおく", async () => {
      setup();
      await fetchFrom(SPOTIFY, ok(jpop, ext));
      const group = screen.getByRole("group", { name: "どの曲として登録しますか？" });
      expect(group).toHaveTextContent(
        "Spotify の「ピースサイン - Peace Sign」 ／ 米津玄師に近い曲が見つかりました。",
      );
      expect(radio(/^ピースサイン米津玄師 ／ BOOTLEG/)).toBeChecked();
      expect(within(group).getByText("（登録済み）")).toBeInTheDocument();
      expect(radio(/Spotify の表記で登録する/)).toHaveAccessibleName(/（修正できます）/);
      expect(
        screen.getByText("Spotify から取得し、Apple Music の表記にそろえました"),
      ).toBeVisible();
    });

    it("候補を選び直すと、ジャンルのタグの提案も差し替える", async () => {
      setup();
      await fetchFrom(SPOTIFY, ok(jpop, ext));
      expect(pressed("#j-pop")).toBe("true");

      await userEvent.click(radio(/Live/));
      expect(radio(/Live/)).toBeChecked();
      expect(screen.getAllByText("ピースサイン (Live)")).toHaveLength(2); // 候補と、確認欄の曲名
      expect(pressed("#j-pop")).toBe("false");
      expect(screen.getByRole("button", { name: "#Rock（新規タグ）を外す" })).toBeInTheDocument();
      // 登録時に付けるタグはそのまま
      expect(pressed("#十八番")).toBe("true");

      await userEvent.click(radio(/^ピースサイン米津玄師/));
      expect(screen.queryByRole("button", { name: /#Rock/ })).toBeNull();
      expect(pressed("#j-pop")).toBe("true");
    });

    it("同じジャンルの新規タグを二重に足さない", async () => {
      setup();
      const rock2 = apple(4, "ピースサイン (Remix)", "Rock");
      await fetchFrom(
        SPOTIFY,
        ok(
          rock,
          external({ confidence: "needs_confirmation", candidates: [cand(rock), cand(rock2)] }),
        ),
      );
      await userEvent.click(radio(/Remix/));
      expect(screen.getAllByRole("button", { name: "#Rock（新規タグ）を外す" })).toHaveLength(1);
    });

    it("登録時に付けるタグと同じジャンルのタグは、候補を変えても外さない", async () => {
      setup(["t3"]);
      await fetchFrom(SPOTIFY, ok(jpop, ext));
      await userEvent.click(radio(/Live/));
      expect(pressed("#j-pop")).toBe("true");
    });

    it("登録済みの候補を選ぶと保存できない", async () => {
      setup();
      await fetchFrom(SPOTIFY, ok(jpop, ext));
      await userEvent.click(radio(/^Peace Sign/));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "「Peace Sign」はすでにセトリに登録されています",
      );
      expect(screen.getByRole("button", { name: "セトリに追加" })).toBeDisabled();
    });

    it("取得元の表記を選ぶと入力欄を開き、その内容で保存する", async () => {
      vi.mocked(saveSongAction).mockResolvedValue({ status: "ok", id: "new" });
      setup();
      await fetchFrom(SPOTIFY, ok(jpop, ext));
      await userEvent.click(radio(/Spotify の表記で登録する/));
      expect(screen.getByText("Spotify の表記のまま")).toBeInTheDocument();
      expect(pressed("#j-pop")).toBe("false");
      const title = screen.getByLabelText("曲名");
      expect(title).toHaveValue("ピースサイン - Peace Sign");
      await userEvent.click(screen.getByRole("button", { name: "セトリに追加" }));
      expect(vi.mocked(saveSongAction).mock.lastCall![0]).toMatchObject({
        draft: { appleTrackId: null, sourceService: "spotify", sourceUrl: SPOTIFY },
        tagIds: ["t1"],
        newTags: [],
      });
    });

    it("アーティストが分からない取得元の表記は、曲名だけを示す", async () => {
      setup();
      const noArtist = { ...sourceDraft, artist: "" };
      await fetchFrom(
        SPOTIFY,
        ok(
          jpop,
          external({
            confidence: "needs_confirmation",
            candidates: [cand(jpop)],
            source: cand(noArtist),
          }),
        ),
      );
      const group = screen.getByRole("group", { name: "どの曲として登録しますか？" });
      expect(group).toHaveTextContent("Spotify の「ピースサイン - Peace Sign」に近い曲");
      expect(radio(/Spotify の表記で登録する/)).toHaveAccessibleName(
        "Spotify の表記で登録するピースサイン - Peace Sign（修正できます）",
      );
    });
  });
});

describe("BulkAdd: Spotify / YouTube Music", () => {
  const item = (input: string, result: LookupResult) => ({ input, result });

  it("確実に見つかった曲だけ最初から選び、要確認・見つからない曲には注記を付ける", async () => {
    const best = apple(1, "ピースサイン", "J-Pop");
    const yt = { ...sourceDraft, title: "Space Sonic", artist: "ELLEGARDEN" };
    const unknown = { ...sourceDraft, title: "名無しの曲", artist: " " };
    vi.mocked(lookupManyAction).mockResolvedValue([
      item("a", ok(best, external({ confidence: "confident" }))),
      item("b", ok(best, external({ confidence: "needs_confirmation", candidates: [cand(best)] }))),
      item("c", ok(yt, external({ service: "youtube_music", confidence: "not_found" }))),
      item("d", ok(unknown, external({ confidence: "not_found" }))),
      item("e", ok(best, external({ confidence: "needs_confirmation" }), { id: "s", title: "x" })),
    ]);
    render(<BulkAdd groups={[]} tags={[]} defaultTagIds={[]} remaining={null} />);
    fireEvent.change(screen.getByLabelText("共有URL（改行区切り）"), {
      target: { value: `${SPOTIFY}\n${YOUTUBE}` },
    });
    await userEvent.click(screen.getByRole("button", { name: "2件の曲情報を取得" }));

    const rows = await screen.findAllByRole("listitem");
    const box = (i: number) => within(rows[i]).getByRole("checkbox") as HTMLInputElement;
    expect([0, 1, 2, 3, 4].map((i) => [box(i).checked, box(i).disabled])).toEqual([
      [true, false],
      [false, false],
      [false, false],
      [false, true],
      [false, true],
    ]);
    expect(rows[0]).not.toHaveTextContent("要確認");
    expect(rows[1]).toHaveTextContent(
      "要確認：Spotify では「ピースサイン - Peace Sign」。表記の違う同じ曲か確かめてから選んでください",
    );
    expect(rows[2]).toHaveTextContent(
      "Apple Music で見つからなかったため YouTube Music の表記のまま",
    );
    expect(rows[3]).toHaveTextContent(
      "アーティストが分からないため、1曲ずつ登録で入力してください",
    );
    // 登録済みの行は、注記ではなくスキップの理由を出す
    expect(rows[4]).toHaveTextContent("登録済みのためスキップ");
    expect(rows[4]).not.toHaveTextContent("要確認");

    await userEvent.click(box(1));
    expect(screen.getByRole("button", { name: "選んだ2曲をセトリに追加" })).toBeEnabled();
  });
});
