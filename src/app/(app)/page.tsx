import type { Metadata } from "next";
import { Suspense } from "react";
import { todayJst } from "@/lib/format";
import { conditionsFromParams } from "@/lib/search/conditions";
import {
  getUserSettings,
  listCustomFields,
  listSavedSearches,
  listTagsWithCount,
  searchSongs,
} from "@/lib/songs/queries";
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
  const { supabase, userId } = await requireUser();

  // 並び順の既定・一覧に出す項目は設定（user_settings）。URL の ?sort= を優先する
  const settings = await getUserSettings(supabase, userId);
  const defaultSort = settings.listSort;

  const [tags, groups, saved, fields, totalRes] = await Promise.all([
    listTagsWithCount(supabase),
    supabase.from("tag_groups").select("id, name").order("sort_order"),
    listSavedSearches(supabase),
    listCustomFields(supabase),
    supabase.from("songs").select("id", { count: "exact", head: true }),
  ]);

  // 削除・統合で存在しなくなったタグ（古いURL・履歴）は条件から外す（AND が常に空になるのを防ぐ）
  const parsed = conditionsFromParams({ get: first });
  const exists = new Set(tags.map((t) => t.id));
  const conditions = {
    ...parsed,
    include: parsed.include.filter((id) => exists.has(id)),
    exclude: parsed.exclude.filter((id) => exists.has(id)),
  };
  const songs = await searchSongs(supabase, conditions, defaultSort);

  return (
    <SetList
      songs={songs}
      total={totalRes.count ?? songs.length}
      conditions={conditions}
      defaultSort={defaultSort}
      tags={tags}
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
      saved={saved}
      fields={fields}
      listColumns={settings.listColumns}
      today={todayJst()}
    />
  );
}
