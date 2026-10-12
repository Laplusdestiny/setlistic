import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { todayJst } from "@/lib/format";
import { getSingState, getSong, listTagsWithCount } from "@/lib/songs/queries";
import { UUID_PATTERN } from "@/lib/songs/validate";
import { requireUser } from "@/lib/supabase/user";
import { SongPageView } from "./SongPageView";

export const metadata: Metadata = { title: "曲の詳細" };

type Params = Promise<{ id: string }>;

export default function SongPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "60dvh" }} aria-busy="true" />}>
      <SongLoader params={params} />
    </Suspense>
  );
}

async function SongLoader({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireUser();
  const song = await getSong(supabase, id);
  if (!song) notFound();

  const [sing, tags, groups] = await Promise.all([
    getSingState(supabase, id),
    listTagsWithCount(supabase),
    supabase.from("tag_groups").select("id, name").order("sort_order"),
  ]);

  return (
    <SongPageView
      song={song}
      sing={sing}
      today={todayJst()}
      allTags={tags.map(({ id, name, groupId }) => ({ id, name, groupId }))}
      groups={(groups.data ?? []).map((g) => ({ id: g.id, name: g.name }))}
    />
  );
}
