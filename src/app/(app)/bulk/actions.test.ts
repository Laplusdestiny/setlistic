import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));

import { requireUser } from "@/lib/supabase/user";
import { bulkEditTagsAction } from "./actions";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const TAG = "33333333-3333-4333-8333-333333333333";

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}
beforeEach(() => setup());

const input = { songIds: [S1, S2], addTagIds: [], newTags: [], removeTagIds: [TAG] };

describe("bulkEditTagsAction", () => {
  it("DB 関数に渡し、変更した曲数を返す", async () => {
    setup({ rpc: { bulk_edit_song_tags: { data: 2 } } });
    expect(await bulkEditTagsAction(input)).toEqual({ status: "ok", count: 2 });
    expect(sb.rpcCalls[0]).toEqual({
      name: "bulk_edit_song_tags",
      args: {
        p_song_ids: [S1, S2],
        p_add_tag_ids: [],
        p_new_tags: [],
        p_remove_tag_ids: [TAG],
        p_set_priority: false,
        p_priority: null,
      },
    });
  });

  it("優先度を指定すると p_set_priority / p_priority を渡す", async () => {
    setup({ rpc: { bulk_edit_song_tags: { data: 2 } } });
    await bulkEditTagsAction({ ...input, priority: 1 });
    expect(sb.rpcCalls[0].args).toMatchObject({ p_set_priority: true, p_priority: 1 });
    await bulkEditTagsAction({ ...input, priority: "none" });
    expect(sb.rpcCalls[1].args).toMatchObject({ p_set_priority: true, p_priority: null });
  });

  it("件数が返らなければ選んだ曲数", async () => {
    expect(await bulkEditTagsAction(input)).toEqual({ status: "ok", count: 2 });
  });

  it("検証エラー・曲なし（P0002）・その他", async () => {
    expect(await bulkEditTagsAction({ songIds: [] })).toEqual({
      status: "error",
      message: "曲を選んでください",
    });
    setup({ rpc: { bulk_edit_song_tags: { error: { code: "P0002" } } } });
    expect(await bulkEditTagsAction(input)).toMatchObject({
      message: expect.stringContaining("見つかりませんでした"),
    });
    setup({ rpc: { bulk_edit_song_tags: { error: { code: "XX000" } } } });
    expect(await bulkEditTagsAction(input)).toEqual({
      status: "error",
      message: "変更できませんでした。もう一度お試しください。",
    });
  });
});
