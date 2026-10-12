// ログイン不要のパス
const PUBLIC_PATHS = ["/login", "/auth/callback", "/terms", "/privacy"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// ログイン後に戻る先として安全な相対パスだけを返す（オープンリダイレクト対策）
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  return next;
}

// 未ログインで開いたパスを ?next= に載せるためのクエリ文字列
export function loginRedirectPath(pathname: string, search: string): string {
  const target = safeNextPath(pathname + search);
  return target === "/" ? "" : `?next=${encodeURIComponent(target)}`;
}
