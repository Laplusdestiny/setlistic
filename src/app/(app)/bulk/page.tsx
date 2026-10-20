import type { Metadata } from "next";
import { Suspense } from "react";
import { DEFAULT_SORT } from "@/lib/songs/sort";
import { EMPTY_CONDITIONS } from "@/lib/search/conditions";
import { listTagsWithCount, searchSongs } from "@/lib/songs/queries";
import { UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";
import { BulkEditScreen } from "./BulkEditScreen";

export const metadata: Metadata = { title: "タグ・優先度の一括変更" };

type Search = Promise<{ ids?: string }>;

export default function BulkPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "60dvh" }} aria-busy="true" />}>
      <BulkLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function BulkLoader({ searchParams }: { searchParams: Search }) {
  const { ids } = await searchParams;
  const { supabase } = await requireUser();

  const [songs, tags, groups] = await Promise.all([
    searchSongs(supabase, EMPTY_CONDITIONS, DEFAULT_SORT),
    listTagsWithCount(supabase),
    supabase.from("tag_groups").select("id, name").order("sort_order"),
  ]);

  // 「まとめて登録」直後などから、登録した曲を選択済みで開く（?ids=…）
  const preselected =
    typeof ids === "string"
      ? ids
          .split(",")
          .filter((i) => UUID_PATTERN.test(i))
          .slice(0, 500)
      : [];

  return (
    <BulkEditScreen
      songs={songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist, tags: s.tags }))}
      tags={tags}
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
      preselectedIds={preselected}
    />
  );
}
