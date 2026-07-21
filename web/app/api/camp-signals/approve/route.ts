import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const proposalId = body?.proposalId as string | undefined;
  if (!proposalId) {
    return NextResponse.json({ error: "proposalId required" }, { status: 400 });
  }

  const sb = createServerClient();

  const { data: proposal, error: fetchErr } = await sb
    .from("camp_battle_proposals")
    .select("*")
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

  const proposed = proposal.proposed_state as {
    status: string;
    candidates: string[];
    note: string | null;
  };

  const { error: upsertErr } = await sb.from("fantasy_position_battles").upsert(
    {
      season: proposal.season,
      team_abbr: proposal.team_abbr,
      position: proposal.position,
      slot: proposal.slot,
      status: proposed.status,
      candidates: proposed.candidates,
      note: proposed.note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "season,team_abbr,position,slot" }
  );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();

  await sb.from("camp_battle_change_log").insert({
    proposal_id: proposal.id,
    season: proposal.season,
    team_abbr: proposal.team_abbr,
    position: proposal.position,
    slot: proposal.slot,
    before_state: proposal.current_state,
    after_state: proposed,
    approved_at: now,
    approved_by: "admin",
  });

  const { error: resolveErr } = await sb
    .from("camp_battle_proposals")
    .update({ status: "approved", resolved_at: now, resolved_by: "admin" })
    .eq("id", proposalId);

  if (resolveErr) {
    return NextResponse.json({ error: resolveErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
