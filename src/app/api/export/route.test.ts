import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  todayJst: () => "2026-10-12",
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(createClient).mockResolvedValue(sb.client as never);
}
const data = { app: "setlistic", version: 1, songs: [{ title: "夜に駆ける", artist: "YOASOBI" }] };
beforeEach(() => setup({ rpc: { export_data: { data } } }));

const get = (q = "") => GET(new NextRequest(`http://localhost/api/export${q}`));

describe("GET /api/export", () => {
  it("既定は JSON を日付入りのファイル名で返す", async () => {
    const res = await get();
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="setlistic-20261012.json"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(await res.text())).toEqual(data);
  });

  it("format=csv なら CSV", async () => {
    const res = await get("?format=csv");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain(".csv");
    expect(await res.text()).toContain("夜に駆ける");
  });

  it("未ログインは 401", async () => {
    setup({ userId: null });
    expect((await get()).status).toBe(401);
    expect(sb.rpcCalls).toEqual([]);
  });

  it("DB エラー・データなしは 500", async () => {
    setup({ rpc: { export_data: { error: { code: "XX000" } } } });
    expect((await get()).status).toBe(500);
    setup({ rpc: { export_data: { data: null } } });
    expect((await get()).status).toBe(500);
  });
});
