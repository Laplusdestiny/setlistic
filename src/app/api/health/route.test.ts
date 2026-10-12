import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

import { createClient } from "@supabase/supabase-js";
import { GET } from "./route";

const rpc = vi.fn();
const get = (authorization?: string) =>
  GET(
    new NextRequest("http://localhost/api/health", {
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
  rpc.mockReset().mockResolvedValue({ data: "2026-10-12T00:00:00Z", error: null });
  vi.mocked(createClient).mockReturnValue({ rpc } as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("秘密が一致すれば DB に ping して時刻を返す", async () => {
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db_time: "2026-10-12T00:00:00Z" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "pk", {
      auth: { persistSession: false },
    });
    expect(rpc).toHaveBeenCalledWith("health_ping");
  });

  it.each([
    ["ヘッダーなし", undefined],
    ["秘密が違う", "Bearer nope!!"],
    ["長さが違う", "Bearer s3cret-extra"],
  ])("%s は 401 で、DB に触れない", async (_, auth) => {
    const res = await get(auth);
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("CRON_SECRET が未設定なら常に 401", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await get("Bearer ")).status).toBe(401);
  });

  it("DB に接続できなければ 503 とログ", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "paused" } });
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[health]"), "paused");
    log.mockRestore();
  });
});
