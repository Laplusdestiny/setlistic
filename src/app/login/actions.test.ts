import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signInWithGoogle, signOut } from "./actions";

let sb: FakeSupabase;
function setHeaders(h: Record<string, string>) {
  vi.mocked(headers).mockResolvedValue(new Headers(h) as never);
}
beforeEach(() => {
  sb = fakeSupabase();
  vi.mocked(createClient).mockResolvedValue(sb.client as never);
  setHeaders({ host: "setlistic.example" });
});

const form = (next?: string) => {
  const fd = new FormData();
  if (next !== undefined) fd.set("next", next);
  return fd;
};
const redirectTo = () =>
  (
    sb.client.auth.signInWithOAuth.mock.calls[0] as unknown as [{ options: { redirectTo: string } }]
  )[0].options.redirectTo;

describe("signInWithGoogle", () => {
  it("Google の認可画面へ送り、戻り先に next を載せる", async () => {
    await expect(signInWithGoogle(form("/songs/1?x=1"))).rejects.toThrow(
      "REDIRECT https://accounts.example/oauth",
    );
    expect(sb.client.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" }),
    );
    expect(redirectTo()).toBe("https://setlistic.example/auth/callback?next=%2Fsongs%2F1%3Fx%3D1");
  });

  it("外部への next はトップにする", async () => {
    await expect(signInWithGoogle(form("https://evil.example"))).rejects.toThrow();
    expect(redirectTo()).toBe("https://setlistic.example/auth/callback?next=%2F");
  });

  it("Origin ヘッダーを優先する", async () => {
    setHeaders({ origin: "https://preview.example", host: "x" });
    await expect(signInWithGoogle(form())).rejects.toThrow();
    expect(redirectTo()).toMatch(/^https:\/\/preview\.example\/auth\/callback/);
  });

  it("プロキシ越しの host/proto を使う", async () => {
    setHeaders({ "x-forwarded-host": "app.example", "x-forwarded-proto": "http" });
    await expect(signInWithGoogle(form())).rejects.toThrow();
    expect(redirectTo()).toMatch(/^http:\/\/app\.example\//);
  });

  it("localhost は http", async () => {
    setHeaders({ host: "localhost:3000" });
    await expect(signInWithGoogle(form())).rejects.toThrow();
    expect(redirectTo()).toMatch(/^http:\/\/localhost:3000\//);
  });

  it("失敗したらログイン画面にエラーを出す", async () => {
    sb.client.auth.signInWithOAuth.mockResolvedValueOnce({
      data: { url: null },
      error: new Error("x"),
    });
    await expect(signInWithGoogle(form())).rejects.toThrow("REDIRECT /login?error=failed");
  });
});

describe("signOut", () => {
  it("ログアウトしてログイン画面へ", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT /login");
    expect(sb.client.auth.signOut).toHaveBeenCalled();
  });
});
