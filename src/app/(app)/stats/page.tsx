import type { Metadata } from "next";
import { Suspense } from "react";
import { todayJst } from "@/lib/format";
import { getSingStats, parsePeriod } from "@/lib/stats/sing-stats";
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
  const period = parsePeriod((await searchParams).period);
  const today = todayJst();
  const { supabase } = await requireUser();
  const stats = await getSingStats(supabase, period, today);
  return <StatsScreen period={period} today={today} stats={stats} />;
}
