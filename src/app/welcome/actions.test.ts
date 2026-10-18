import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongDraft } from "@/lib/songs/types";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));
vi.mock("@/app/(app)/add/actions", () => ({ lookupFromUrl: vi.fn(), saveSongAction: vi.fn() }));

import { lookupFromUrl, saveSongAction } from "@/app/(app)/add/actions";
import type { LookupResult } from "@/app/(app)/add/types";
import { requireUser } from "@/lib/supabase/user";
import { completeTutorialAction, registerFirstSongAction } from "./actions";

const URL1 = "https://music.apple.com/jp/song/x/1";
const draft = (over: Partial<SongDraft> = {}): SongDraft => ({
  appleTrackId: 1,
  title: "夜に駆ける",
  artist: "YOASOBI",
  album: null,
  genre: null,
  artworkUrl: null,
  durationMs: null,
  releaseDate: null,
  appleUrl: null,
  sourceService: "apple_music",
  sourceUrl: URL1,
  ...over,
});

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}
beforeEach(() => {
  setup({ tables: { user_settings: { data: { default_tag_ids: ["t1"] } } } });
  vi.mocked(lookupFromUrl).mockReset();
  vi.mocked(saveSongAction).mockReset();
});

const lookup = (r: LookupResult) => vi.mocked(lookupFromUrl).mockResolvedValue(r);
/** user_settings への update（完了の記録）の操作 */
const completion = () =>
  sb.calls.find((c) => c.table === "user_settings" && c.ops.some(([m]) => m === "update"))?.ops;

describe("completeTutorialAction", () => {
  it("本人の行に、まだ記録が無いときだけ完了日時を入れる", async () => {
    await completeTutorialAction();
    const ops = completion()!;
    expect(ops.find(([m]) => m === "update")?.[1]).toEqual({
      tutorial_completed_at: expect.any(String),
    });
    expect(ops).toContainEqual(["eq", "user_id", "user-1"]);
    expect(ops).toContainEqual(["is", "tutorial_completed_at", null]);
  });
});

describe("registerFirstSongAction", () => {
  it("取得した曲を、登録時に付けるタグ付きで登録し、チュートリアルを完了にする", async () => {
    lookup({ status: "ok", draft: draft(), duplicate: null });
    vi.mocked(saveSongAction).mockResolvedValue({ status: "ok", id: "s1" });
    expect(await registerFirstSongAction(URL1)).toEqual({ status: "ok", id: "s1" });
    expect(lookupFromUrl).toHaveBeenCalledWith(URL1);
    expect(saveSongAction).toHaveBeenCalledWith({
      draft: draft(),
      songKey: 0,
      memo: "",
      tagIds: ["t1"],
      newTags: [],
    });
    expect(completion()).toBeDefined();
  });

  it("読み取れない URL は登録画面と同じ案内を返し、完了にしない", async () => {
    lookup({ status: "error", reason: "album_only" });
    const r = await registerFirstSongAction("https://music.apple.com/jp/album/x/1");
    expect(r).toEqual({ status: "error", message: expect.stringContaining("アルバムのURL") });
    expect(saveSongAction).not.toHaveBeenCalled();
    expect(completion()).toBeUndefined();
  });

  it("登録済みの曲は登録しない", async () => {
    lookup({ status: "ok", draft: draft(), duplicate: { id: "s0", title: "夜に駆ける" } });
    expect(await registerFirstSongAction(URL1)).toEqual({
      status: "error",
      message: expect.stringContaining("「夜に駆ける」はすでに登録されています"),
    });
    expect(saveSongAction).not.toHaveBeenCalled();
  });

  it("Spotify などで確信できないときは、取得元の表記で登録する", async () => {
    const source = draft({ appleTrackId: null, sourceService: "spotify", title: "元の表記" });
    lookup({
      status: "ok",
      draft: draft({ title: "候補" }),
      duplicate: null,
      external: {
        service: "spotify",
        confidence: "needs_confirmation",
        source: { draft: source, duplicate: null },
        candidates: [{ draft: draft({ title: "候補" }), duplicate: null }],
        itunesFailed: false,
      },
    });
    vi.mocked(saveSongAction).mockResolvedValue({ status: "ok", id: "s2" });
    expect(await registerFirstSongAction("https://open.spotify.com/track/x")).toEqual({
      status: "ok",
      id: "s2",
    });
    expect(vi.mocked(saveSongAction).mock.calls[0][0]).toMatchObject({ draft: source });
  });

  it("確信できる候補があれば、そちらで登録する", async () => {
    lookup({
      status: "ok",
      draft: draft({ title: "そろえた表記" }),
      duplicate: null,
      external: {
        service: "youtube_music",
        confidence: "confident",
        source: { draft: draft({ title: "元" }), duplicate: null },
        candidates: [],
        itunesFailed: false,
      },
    });
    vi.mocked(saveSongAction).mockResolvedValue({ status: "ok", id: "s3" });
    await registerFirstSongAction("https://music.youtube.com/watch?v=x");
    expect(vi.mocked(saveSongAction).mock.calls[0][0]).toMatchObject({
      draft: { title: "そろえた表記" },
    });
  });

  it("保存に失敗したら理由を返し、完了にしない", async () => {
    lookup({ status: "ok", draft: draft(), duplicate: null });
    const cases = [
      [{ status: "duplicate" }, "すでに登録されています"],
      [{ status: "limit" }, "上限に達しています"],
      [{ status: "error", message: "保存できませんでした。" }, "保存できませんでした。"],
    ] as const;
    for (const [res, msg] of cases) {
      vi.mocked(saveSongAction).mockResolvedValueOnce(res);
      expect(await registerFirstSongAction(URL1)).toEqual({
        status: "error",
        message: expect.stringContaining(msg),
      });
    }
    expect(completion()).toBeUndefined();
  });
});
