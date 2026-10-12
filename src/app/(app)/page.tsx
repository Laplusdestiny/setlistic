import type { Metadata } from "next";
import { Suspense } from "react";
import { todayJst } from "@/lib/format";
import { conditionsFromParams } from "@/lib/search/conditions";
import { listSavedSearches, listTagsWithCount, searchSongs } from "@/lib/songs/queries";
import { parseSort } from "@/lib/songs/sort";
import { requireUser } from "@/lib/supabase/user";
import { SetList } from "./SetList";
import styles from "./home.module.css";

export const metadata: Metadata = { title: "セトリ" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function HomePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className={styles.loading} aria-busy="true" />}>
      <HomeLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeLoader({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const first = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const conditions = conditionsFromParams({ get: first });
  const { supabase, userId } = await requireUser();

  // 並び順の既定は設定（user_settings.list_sort）。URL の ?sort= を優先する
  const { data: settings } = await supabase
    .from("user_settings")
    .select("list_sort")
    .eq("user_id", userId)
    .maybeSingle();
  const defaultSort = parseSort(settings?.list_sort);

  const [songs, tags, groups, saved, totalRes] = await Promise.all([
    searchSongs(supabase, conditions, defaultSort),
    listTagsWithCount(supabase),
    supabase.from("tag_groups").select("id, name").order("sort_order"),
    listSavedSearches(supabase),
    supabase.from("songs").select("id", { count: "exact", head: true }),
  ]);

  return (
    <SetList
      songs={songs}
      total={totalRes.count ?? songs.length}
      conditions={conditions}
      defaultSort={defaultSort}
      tags={tags}
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
      saved={saved}
      today={todayJst()}
    />
  );
}
