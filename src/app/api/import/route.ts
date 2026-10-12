import { NextResponse, type NextRequest } from "next/server";
import { IMPORT_LIMITS, parseImport } from "@/lib/data/import";
import { createClient } from "@/lib/supabase/server";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// JSON（Setlistic のエクスポート形式）を取り込む。既存のデータは消さず、追加のみ。
// 検証は parseImport、書き込みは DB関数 import_data（1トランザクション・RLS が効く）。
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return json({ ok: false, error: "ログインしてください" }, 401);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return json({ ok: false, error: "ファイルを読み取れませんでした" }, 400);
  }
  if (!(file instanceof File)) return json({ ok: false, error: "ファイルを選んでください" }, 400);
  if (file.size > IMPORT_LIMITS.bytes)
    return json(
      { ok: false, error: `ファイルが大きすぎます（${IMPORT_LIMITS.bytes / 1024 / 1024}MBまで）` },
      413,
    );

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return json({ ok: false, error: "JSONとして読み取れませんでした" }, 400);
  }

  const parsed = parseImport(raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const { data, error } = await supabase.rpc("import_data", { p: parsed.payload });
  if (error)
    return json(
      { ok: false, error: "取り込めませんでした。ファイルの内容を確認してください。" },
      400,
    );

  return json({ ok: true, result: data, warnings: parsed.warnings });
}
