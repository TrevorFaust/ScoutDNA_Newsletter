import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const proposalId = body?.proposalId as string | undefined;
  const reason = (body?.reason as string | undefined)?.trim() || null;
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

  const { error: updateErr } = await sb
    .from("camp_battle_proposals")
    .update({
      status: "rejected",
      resolved_at: new Date().toISOString(),
      resolved_by: "admin",
      reject_reason: reason,
    })
    .eq("id", proposalId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
