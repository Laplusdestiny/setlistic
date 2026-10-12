import { NextResponse, type NextRequest } from "next/server";
import { exportToCsv, type ExportedData } from "@/lib/data/csv";
import { todayJst } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// ログインが必要（proxy がログイン前のアクセスを /login に送る）。自分のデータだけが出力される（RLS）
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("export_data");
  if (error || !data) return NextResponse.json({ error: "export failed" }, { status: 500 });

  const date = todayJst().replaceAll("-", "");
  const body = format === "csv" ? exportToCsv(data as ExportedData) : JSON.stringify(data, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type":
        format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="setlistic-${date}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
