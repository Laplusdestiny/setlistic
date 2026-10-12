import type { Metadata } from "next";
import { Suspense } from "react";
import { todayJst } from "@/lib/format";
import { listSongs, listTagsWithCount } from "@/lib/songs/queries";
import { parseSort } from "@/lib/songs/sort";
import { UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";
import { SetList } from "./SetList";
import styles from "./home.module.css";

export const metadata: Metadata = { title: "セトリ" };

type Search = Promise<{ sort?: string; tag?: string }>;

export default function HomePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className={styles.loading} aria-busy="true" />}>
      <HomeLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeLoader({ searchParams }: { searchParams: Search }) {
  const { sort: sortParam, tag } = await searchParams;
  const { supabase, userId } = await requireUser();

  // 並び順の既定は設定（user_settings.list_sort）。URL の ?sort= を優先する
  const { data: settings } = await supabase
    .from("user_settings")
    .select("list_sort")
    .eq("user_id", userId)
    .maybeSingle();
  const defaultSort = parseSort(settings?.list_sort);
  const sort = parseSort(sortParam, defaultSort);
  const tagId = typeof tag === "string" && UUID_PATTERN.test(tag) ? tag : null;

  const [songs, tags, groups, totalRes] = await Promise.all([
    listSongs(supabase, { sort, tagId }),
    listTagsWithCount(supabase),
    supabase.from("tag_groups").select("id, name").order("sort_order"),
    supabase.from("songs").select("id", { count: "exact", head: true }),
  ]);

  return (
    <SetList
      songs={songs}
      total={totalRes.count ?? songs.length}
      sort={sort}
      defaultSort={defaultSort}
      tagId={tagId}
      tags={tags}
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
      today={todayJst()}
    />
  );
}
