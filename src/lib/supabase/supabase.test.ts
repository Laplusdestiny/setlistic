import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";
import { updateSession } from "./proxy";
import { createClient } from "./server";
import { requireUser } from "./user";
import { config, proxy } from "@/proxy";

type CookieOpts = {
  getAll: () => unknown;
  setAll: (c: { name: string; value: string; options?: object }[]) => void;
};
/** createServerClient に渡された cookies の実装を取り出す */
const cookieOpts = () =>
  (vi.mocked(createServerClient).mock.lastCall![2] as { cookies: CookieOpts }).cookies;

let sub: string | null;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
  sub = "user-1";
  vi.mocked(createServerClient)
    .mockReset()
    .mockImplementation(
      () =>
        ({
          auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
        }) as never,
    );
});
afterEach(() => vi.unstubAllEnvs());

describe("supabaseEnv", () => {
  it("URL と公開キーを返す", () => {
    expect(supabaseEnv()).toEqual({ url: "https://example.supabase.co", key: "pk" });
  });

  it("どちらかが未設定なら例外", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => supabaseEnv()).toThrow(/未設定/);
  });
});

describe("createClient（サーバー）", () => {
  const store = { getAll: vi.fn(() => [{ name: "a", value: "1" }]), set: vi.fn() };
  beforeEach(() => {
    store.set.mockReset();
    vi.mocked(cookies).mockResolvedValue(store as never);
  });

  it("Cookie の読み書きを next/headers に任せる", async () => {
    await createClient();
    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "pk",
      expect.anything(),
    );
    const c = cookieOpts();
    expect(c.getAll()).toEqual([{ name: "a", value: "1" }]);
    c.setAll([{ name: "sb", value: "v", options: { path: "/" } }]);
    expect(store.set).toHaveBeenCalledWith("sb", "v", { path: "/" });
  });

  it("Server Component から呼ばれて書き込めなくても例外にしない", async () => {
    store.set.mockImplementation(() => {
      throw new Error("read-only");
    });
    await createClient();
    expect(() => cookieOpts().setAll([{ name: "sb", value: "v" }])).not.toThrow();
  });
});

describe("requireUser", () => {
  beforeEach(() => vi.mocked(cookies).mockResolvedValue({ getAll: () => [], set() {} } as never));

  it("ログイン中ならクライアントとユーザーIDを返す", async () => {
    const r = await requireUser();
    expect(r.userId).toBe("user-1");
    expect(r.supabase).toBeDefined();
  });

  it("未ログインならログイン画面へ", async () => {
    sub = null;
    await expect(requireUser()).rejects.toThrow("REDIRECT /login");
  });
});

describe("updateSession（proxy）", () => {
  const req = (path: string) => new NextRequest(`https://setlistic.example${path}`);

  it("ログイン済みならそのまま通す", async () => {
    const res = await updateSession(req("/songs/1"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("未ログインで保護されたパスは /login?next= へ", async () => {
    sub = null;
    const res = await updateSession(req("/tags?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://setlistic.example/login?next=%2Ftags%3Fx%3D1",
    );
  });

  it("未ログインでも公開パスは通す", async () => {
    sub = null;
    for (const p of ["/login", "/terms", "/api/health"])
      expect((await updateSession(req(p))).headers.get("location")).toBeNull();
  });

  it("ログイン済みで /login を開いたらトップへ", async () => {
    const res = await updateSession(req("/login?next=/x"));
    expect(res.headers.get("location")).toBe("https://setlistic.example/");
  });

  it("更新されたセッション Cookie を応答に載せる", async () => {
    const r = req("/");
    vi.mocked(createServerClient).mockImplementation((_u, _k, opts) => {
      return {
        auth: {
          getClaims: async () => {
            (opts as { cookies: CookieOpts }).cookies.setAll([
              { name: "sb-token", value: "new", options: { path: "/" } },
            ]);
            return { data: { claims: { sub: "user-1" } } };
          },
        },
      } as never;
    });
    const res = await updateSession(r);
    expect(r.cookies.get("sb-token")?.value).toBe("new");
    expect(res.cookies.get("sb-token")?.value).toBe("new");
    expect(cookieOpts().getAll()).toContainEqual({ name: "sb-token", value: "new" });
  });

  it("src/proxy.ts は updateSession に委ねる", async () => {
    sub = null;
    expect((await proxy(req("/"))).status).toBe(307);
    expect(config.matcher[0]).toContain("_next/static");
  });
});
