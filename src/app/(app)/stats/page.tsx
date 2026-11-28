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
  // 先に searchParams を読んで、リクエスト時の描画にする（現在時刻を事前描画の中で使わない）
  const params = await searchParams;
  const today = todayJst();
  const range = parseRange(params, today);
  const { supabase } = await requireUser();
  const stats = await getSingStats(supabase, range, today);
  return <StatsScreen range={range} today={today} stats={stats} />;
}
