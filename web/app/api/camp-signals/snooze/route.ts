import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const DEFAULT_SNOOZE_DAYS = 3;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const proposalId = body?.proposalId as string | undefined;
  const days = Number(body?.days) > 0 ? Number(body.days) : DEFAULT_SNOOZE_DAYS;
  if (!proposalId) {
    return NextResponse.json({ error: "proposalId required" }, { status: 400 });
  }

  const sb = createServerClient();

  const { data: proposal, error: fetchErr } = await sb
    .from("camp_battle_proposals")
    .select("id, status")
    .eq("id", proposalId)
    .maybeSingle();

  if (fetchErr || !proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  if (proposal.status !== "pending") {
    return NextResponse.json(
      { error: `Proposal is already ${proposal.status}` },
      { status: 409 }
    );
  }

  const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateErr } = await sb
    .from("camp_battle_proposals")
    .update({ status: "snoozed", snooze_until: snoozeUntil })
    .eq("id", proposalId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snoozeUntil });
}
