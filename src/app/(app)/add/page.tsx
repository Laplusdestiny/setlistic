import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/user";
import { AddSong } from "./AddSong";
import type { GroupOption, TagOption } from "./types";
import styles from "./add.module.css";

export const metadata: Metadata = { title: "曲を登録" };

// Siri ショートカット等からの `/add?url=<共有URL>` はURL欄に入った状態で開く（自動取得・保存はしない）
export default function AddPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  return (
    <Suspense fallback={<div className={styles.loading} aria-busy="true" />}>
      <AddLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function AddLoader({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  const { supabase, userId } = await requireUser();

  const [groups, tags, settings, count] = await Promise.all([
    supabase.from("tag_groups").select("id, name").order("sort_order"),
    supabase.from("tags").select("id, name, group_id").order("sort_order"),
    supabase.from("user_settings").select("default_tag_ids").eq("user_id", userId).maybeSingle(),
    supabase.from("songs").select("id", { count: "exact", head: true }),
  ]);

  const groupOptions: GroupOption[] = (groups.data ?? []).map((g) => ({ id: g.id, name: g.name }));
  const tagOptions: TagOption[] = (tags.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    groupId: t.group_id,
  }));

  return (
    <AddSong
      initialUrl={typeof url === "string" ? url.slice(0, 2000) : ""}
      groups={groupOptions}
      tags={tagOptions}
      defaultTagIds={settings.data?.default_tag_ids ?? []}
      nextNumber={(count.count ?? 0) + 1}
    />
  );
}
