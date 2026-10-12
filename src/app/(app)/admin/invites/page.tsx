import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { InviteRow } from "@/lib/invites";
import { isAppAdmin } from "@/lib/songs/queries";
import { requireUser } from "@/lib/supabase/user";
import { InvitesScreen } from "./InvitesScreen";

export const metadata: Metadata = { title: "招待の管理" };

export default function InvitesPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "60dvh" }} aria-busy="true" />}>
      <InvitesLoader />
    </Suspense>
  );
}

async function InvitesLoader() {
  const { supabase } = await requireUser();
  // 管理者かどうかは DB が判定する。管理者でなければ、このページは存在しないものとして扱う
  if (!(await isAppAdmin(supabase))) notFound();

  const { data } = await supabase.rpc("admin_list_invites");
  const rows: InviteRow[] = (
    (data ?? []) as {
      email_hash: string;
      label: string | null;
      invited_at: string;
      user_id: string | null;
      last_sign_in_at: string | null;
      is_self: boolean;
    }[]
  ).map((r) => ({
    emailHash: r.email_hash,
    label: r.label,
    invitedAt: r.invited_at,
    userId: r.user_id,
    lastSignInAt: r.last_sign_in_at,
    isSelf: r.is_self,
  }));

  return <InvitesScreen invites={rows} />;
}
