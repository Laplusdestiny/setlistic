import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Supabase 無料プランの一時停止（無操作が続くと停止）を防ぐための定期ヘルスチェック。
 * Vercel Cron（vercel.json の crons）が週1回呼ぶ。CRON_SECRET（Vercel が Authorization ヘッダーで付ける）で保護する。
 * ログイン不要のパスだが、秘密が一致しないと何もしない。使うのは公開用キーだけで、ユーザーのデータには触れない。
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return json({ ok: false }, 401);

  const { url, key } = supabaseEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("health_ping");

  if (error) {
    // Vercel のログ（vercel logs --level error）で確認できる
    console.error("[health] DB に接続できませんでした:", error.message);
    return json({ ok: false }, 503);
  }
  return json({ ok: true, db_time: data });
}
