import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const toLogin = (error: string) => NextResponse.redirect(`${origin}/login?error=${error}`);

  // 招待制フックで拒否された場合、Supabase が error_description 付きで戻してくる
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return toLogin(providerError.includes("招待制") ? "denied" : "failed");
  }

  const code = searchParams.get("code");
  if (!code) return toLogin("failed");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return toLogin("failed");

  return NextResponse.redirect(`${origin}${next}`);
}
