import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { todayJst } from "@/lib/format";
import { getSingState, getSong, listCustomFields, listTagsWithCount } from "@/lib/songs/queries";
import { UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";
import { SongPageView } from "./SongPageView";

export const metadata: Metadata = { title: "曲の詳細" };

type Params = Promise<{ id: string }>;
type Search = Promise<{ edit?: string | string[] }>;

// `?edit=1` は編集フォームを開いた状態で表示する（チュートリアルの「タグを付ける」から来るとき）
export default function SongPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  return (
    <Suspense fallback={<div style={{ minHeight: "60dvh" }} aria-busy="true" />}>
      <SongLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SongLoader({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, { edit }] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireUser();
  const song = await getSong(supabase, id);
  if (!song) notFound();

  const [sing, tags, groups, fields] = await Promise.all([
    getSingState(supabase, id),
    listTagsWithCount(supabase),
    supabase.from("tag_groups").select("id, name").order("sort_order"),
    listCustomFields(supabase),
  ]);

  return (
    <SongPageView
      song={song}
      sing={sing}
      today={todayJst()}
      allTags={tags.map(({ id, name, groupId, aliases }) => ({ id, name, groupId, aliases }))}
      fields={fields}
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
      editing={edit === "1"}
    />
  );
}
