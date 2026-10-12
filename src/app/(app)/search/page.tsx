import type { Metadata } from "next";
import { Suspense } from "react";
import { conditionsFromParams } from "@/lib/search/conditions";
import { listSavedSearches, listTagsWithCount } from "@/lib/songs/queries";
import { requireUser } from "@/lib/supabase/user";
import { SearchScreen } from "./SearchScreen";

export const metadata: Metadata = { title: "絞り込み検索" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function SearchPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "60dvh" }} aria-busy="true" />}>
      <SearchLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function SearchLoader({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const first = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const { supabase } = await requireUser();

  const [tags, groups, saved] = await Promise.all([
    listTagsWithCount(supabase),
    supabase.from("tag_groups").select("id, name").order("sort_order"),
    listSavedSearches(supabase),
  ]);

  return (
    <SearchScreen
      initial={conditionsFromParams({ get: first })}
      tags={tags.map(({ id, name, groupId }) => ({ id, name, groupId }))}
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
      saved={saved}
    />
  );
}
