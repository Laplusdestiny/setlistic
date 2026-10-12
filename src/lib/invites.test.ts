import { describe, expect, it } from "vitest";
import { inviteMessage, isPending, shortHash, validateInvite } from "./invites";

describe("validateInvite", () => {
  it("メールは小文字・trim、メモは空白を整える", () => {
    expect(validateInvite({ email: "  Friend@Example.COM ", label: "  大学の  友人 " })).toEqual({
      ok: true,
      value: { email: "friend@example.com", label: "大学の 友人" },
    });
  });
  it("メモなしは null", () => {
    expect(validateInvite({ email: "a@b.co", label: "  " })).toEqual({
      ok: true,
      value: { email: "a@b.co", label: null },
    });
    expect(validateInvite({ email: "a@b.co" }).ok).toBe(true);
  });
  it("不正なメールを拒否", () => {
    for (const email of [
      "",
      "  ",
      "no-at",
      "a@b",
      "a b@c.com",
      "@c.com",
      "a@@b.com",
      `${"a".repeat(250)}@x.com`,
      5,
      null,
    ]) {
      expect(validateInvite({ email }).ok, String(email)).toBe(false);
    }
    expect(validateInvite(null).ok).toBe(false);
  });
  it("メモは30文字まで", () => {
    expect(validateInvite({ email: "a@b.co", label: "あ".repeat(30) }).ok).toBe(true);
    expect(validateInvite({ email: "a@b.co", label: "あ".repeat(31) }).ok).toBe(false);
  });
});

describe("inviteMessage", () => {
  it("URLと手順を含む", () => {
    const m = inviteMessage("https://setlistic.example");
    expect(m).toContain("https://setlistic.example");
    expect(m).toContain("Googleでサインイン");
    expect(m).toContain("ホーム画面に追加");
  });
});

describe("helpers", () => {
  it("isPending / shortHash", () => {
    expect(isPending({ userId: null })).toBe(true);
    expect(isPending({ userId: "x" })).toBe(false);
    expect(shortHash("abcdef0123")).toBe("abcdef");
  });
});
