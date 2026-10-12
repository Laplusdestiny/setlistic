import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/user";
import { TagsScreen, type ManagedTag } from "./TagsScreen";

export const metadata: Metadata = { title: "タグ" };

export default function TagsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "60dvh" }} aria-busy="true" />}>
      <TagsLoader />
    </Suspense>
  );
}

async function TagsLoader() {
  const { supabase } = await requireUser();
  const [groups, tags] = await Promise.all([
    supabase.from("tag_groups").select("id, name, sort_order").order("sort_order").order("name"),
    supabase
      .from("tags")
      .select("id, name, group_id, sort_order, uses:song_tags(count), aliases:tag_aliases(alias)")
      .order("sort_order")
      .order("name"),
  ]);

  const managed: ManagedTag[] = (tags.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    groupId: t.group_id,
    count: (t.uses as { count: number }[] | null)?.[0]?.count ?? 0,
    aliases: ((t.aliases as { alias: string }[] | null) ?? []).map((a) => a.alias).sort(),
  }));

  return (
    <TagsScreen
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
      tags={managed}
    />
  );
}
