import { redirect } from "next/navigation";
import { createClient } from "./server";

/** ログイン必須の処理の入口。JWT付きのクライアント（RLSが効く）とユーザーIDを返す */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}
