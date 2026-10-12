import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 静的ファイル・PWAアイコン・manifest は対象外
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.*\\.(?:png|svg)$).*)",
  ],
};
