import type { Metadata } from "next";
import { Suspense } from "react";
import {
  getUserSettings,
  isAppAdmin,
  listCustomFields,
  listTagsWithCount,
} from "@/lib/songs/queries";
import { requireUser } from "@/lib/supabase/user";
import { SettingsScreen } from "./SettingsScreen";

export const metadata: Metadata = { title: "設定" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "60dvh" }} aria-busy="true" />}>
      <SettingsLoader />
    </Suspense>
  );
}

async function SettingsLoader() {
  const { supabase, userId } = await requireUser();
  const [settings, fields, tags, groups, claims, admin] = await Promise.all([
    getUserSettings(supabase, userId),
    listCustomFields(supabase),
    listTagsWithCount(supabase),
    supabase.from("tag_groups").select("id, name").order("sort_order"),
    supabase.auth.getClaims(),
    isAppAdmin(supabase),
  ]);

  return (
    <SettingsScreen
      // メールアドレスはログイン情報（Supabase Auth）から表示するだけで、アプリのテーブルには保存していない
      email={typeof claims.data?.claims?.email === "string" ? claims.data.claims.email : ""}
      settings={settings}
      isAdmin={admin}
      fields={fields}
      tags={tags.map(({ id, name, groupId }) => ({ id, name, groupId }))}
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
    />
  );
}
