import { describe, expect, it } from "vitest";
import { isPublicPath, loginRedirectPath, safeNextPath } from "./paths";

describe("isPublicPath", () => {
  it("ログイン関連は公開", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/privacy")).toBe(true);
  });
  it("それ以外は非公開", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/add")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("相対パスはそのまま", () => {
    expect(safeNextPath("/add?url=https%3A%2F%2Fx")).toBe("/add?url=https%3A%2F%2Fx");
  });
  it("外部URL・プロトコル相対・バックスラッシュは / に落とす", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/a\\b")).toBe("/");
  });
  it("空は /", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });
});

describe("loginRedirectPath", () => {
  it("トップならクエリなし", () => {
    expect(loginRedirectPath("/", "")).toBe("");
  });
  it("元のパスとクエリを next に載せる（/add?url= を保持）", () => {
    expect(loginRedirectPath("/add", "?url=abc")).toBe("?next=%2Fadd%3Furl%3Dabc");
  });
});
