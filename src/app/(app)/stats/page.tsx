import type { Metadata } from "next";
import { Suspense } from "react";
import { todayJst } from "@/lib/format";
import { getSingStats, parseRange } from "@/lib/stats/sing-stats";
import { requireUser } from "@/lib/supabase/user";
import { StatsScreen } from "./StatsScreen";

export const metadata: Metadata = { title: "振り返り" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function StatsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "60dvh" }} aria-busy="true" />}>
      <StatsLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function StatsLoader({ searchParams }: { searchParams: Search }) {
  const today = todayJst();
  const range = parseRange(await searchParams, today);
  const { supabase } = await requireUser();
  const stats = await getSingStats(supabase, range, today);
  return <StatsScreen range={range} today={today} stats={stats} />;
}
