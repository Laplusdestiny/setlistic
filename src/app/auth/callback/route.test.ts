import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

let sb: FakeSupabase;
beforeEach(() => {
  sb = fakeSupabase();
  vi.mocked(createClient).mockResolvedValue(sb.client as never);
});

const location = async (q: string) =>
  (await GET(new NextRequest(`https://setlistic.example/auth/callback${q}`))).headers.get(
    "location",
  );

describe("GET /auth/callback", () => {
  it("コードをセッションに交換し、next へ戻す", async () => {
    expect(await location("?code=abc&next=%2Fsongs%2F1")).toBe("https://setlistic.example/songs/1");
    expect(sb.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("外部への next はトップに置き換える（オープンリダイレクト対策）", async () => {
    expect(await location("?code=abc&next=//evil.example")).toBe("https://setlistic.example/");
  });

  it("招待制で拒否されたら denied、その他のプロバイダーエラーは failed", async () => {
    expect(await location("?error_description=招待制のため利用できません")).toBe(
      "https://setlistic.example/login?error=denied",
    );
    expect(await location("?error=access_denied")).toBe(
      "https://setlistic.example/login?error=failed",
    );
    expect(sb.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("コードがない・交換に失敗したら failed", async () => {
    expect(await location("")).toBe("https://setlistic.example/login?error=failed");
    sb.client.auth.exchangeCodeForSession.mockResolvedValueOnce({ error: new Error("expired") });
    expect(await location("?code=old")).toBe("https://setlistic.example/login?error=failed");
  });
});
