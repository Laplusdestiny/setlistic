import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 静的ファイル・PWAアイコン・manifest・OGP画像は対象外（OGP画像は未ログインのクローラーが取りに来る）
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|opengraph-image|icon.*\\.(?:png|svg)$).*)",
  ],
};
