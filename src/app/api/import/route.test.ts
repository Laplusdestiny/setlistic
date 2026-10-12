import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(createClient).mockResolvedValue(sb.client as never);
}
beforeEach(() => setup());

function post(body?: FormData | string, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/import", { method: "POST", body, headers });
}
function withFile(content: string, name = "export.json") {
  const fd = new FormData();
  fd.set("file", new File([content], name, { type: "application/json" }));
  return post(fd);
}
const valid = JSON.stringify({ app: "setlistic", version: 1, songs: [] });

describe("POST /api/import", () => {
  it("未ログインは 401", async () => {
    setup({ userId: null });
    const res = await POST(withFile(valid));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "ログインしてください" });
  });

  it("取り込み結果と警告を返す（キャッシュさせない）", async () => {
    setup({ rpc: { import_data: { data: { songs: 0 } } } });
    const res = await POST(withFile(valid));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, result: { songs: 0 }, warnings: [] });
    expect(sb.rpcCalls[0]).toMatchObject({ name: "import_data", args: { p: { songs: [] } } });
  });

  it("フォームとして読めない本文は 400", async () => {
    const res = await POST(post("x", { "content-type": "multipart/form-data; boundary=zz" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("ファイルを読み取れませんでした");
  });

  it("ファイルがなければ 400", async () => {
    const fd = new FormData();
    fd.set("file", "文字列");
    const res = await POST(post(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("ファイルを選んでください");
  });

  it("4MB を超えるファイルは 413", async () => {
    const res = await POST(withFile("x".repeat(4 * 1024 * 1024 + 1)));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toContain("4MBまで");
  });

  it("JSON でない・形式が違うファイルは 400", async () => {
    let res = await POST(withFile("{broken"));
    expect((await res.json()).error).toBe("JSONとして読み取れませんでした");
    res = await POST(withFile(JSON.stringify({ app: "other" })));
    expect(res.status).toBe(400);
    expect(sb.rpcCalls).toEqual([]);
  });

  it("曲数の上限（53400）とその他の DB エラー", async () => {
    setup({ rpc: { import_data: { error: { code: "53400" } } } });
    let res = await POST(withFile(valid));
    expect((await res.json()).error).toContain("上限を超える");
    setup({ rpc: { import_data: { error: { code: "XX000" } } } });
    res = await POST(withFile(valid));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("取り込めませんでした");
  });
});
