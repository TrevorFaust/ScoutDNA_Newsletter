import { createServerClient } from "@/lib/supabase";

export type CampBattleRow = {
  team_abbr: string;
  position: string;
  slot: string;
  status: string;
  candidates: string[];
  note: string | null;
};

export type CampScoreRow = {
  team_abbr: string;
  position: string;
  slot: string;
  player_name: string;
  score: number;
  signal_count: number;
  up_count: number;
  down_count: number;
  trend: string;
  top_source_tier: number | null;
  window_days: number;
};

export type CampSignalRow = {
  id: string;
  content_date: string;
  team_abbr: string;
  slot: string;
  player_name: string;
  direction: string;
  strength: number;
  signal_type: string;
  summary: string;
  source_url: string | null;
  source_tier: number;
};

export async function fetchCampBattles(
  teamAbbr?: string | null
): Promise<CampBattleRow[]> {
  const sb = createServerClient();
  let q = sb
    .from("fantasy_position_battles")
    .select("team_abbr, position, slot, status, candidates, note")
    .eq("season", 2026)
    .in("status", ["contested", "open"])
    .order("team_abbr")
    .order("slot");
  if (teamAbbr) q = q.eq("team_abbr", teamAbbr);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CampBattleRow[];
}

export async function fetchCampSlotScores(
  windowDays = 7,
  teamAbbr?: string | null
): Promise<CampScoreRow[]> {
  const sb = createServerClient();
  let q = sb
    .from("camp_slot_scores")
    .select("*")
    .eq("season", 2026)
    .eq("window_days", windowDays)
    .order("team_abbr")
    .order("slot")
    .order("score", { ascending: false });
  if (teamAbbr) q = q.eq("team_abbr", teamAbbr);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CampScoreRow[];
}

export async function fetchRecentCampSignals(
  limit = 80,
  teamAbbr?: string | null
): Promise<CampSignalRow[]> {
  const sb = createServerClient();
  let q = sb
    .from("camp_player_signals")
    .select(
      "id, content_date, team_abbr, slot, player_name, direction, strength, signal_type, summary, source_url, source_tier"
    )
    .order("content_date", { ascending: false })
    .order("extracted_at", { ascending: false })
    .limit(limit);
  if (teamAbbr) q = q.eq("team_abbr", teamAbbr);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CampSignalRow[];
}

export type CampProposalEvidence = {
  date: string | null;
  player: string;
  direction: string;
  strength: number;
  source_tier: number;
  summary: string;
  url: string | null;
  /** How many near-duplicate reports of this same story were collapsed into
   * this one evidence item (republished/syndicated coverage of one event). */
  repeat_count: number;
};

export type CampBattleProposal = {
  id: string;
  season: number;
  team_abbr: string;
  position: string;
  slot: string;
  proposal_type:
    | "settle_slot"
    | "strengthen_lean"
    | "widen_battle"
    | "narrow_battle"
    | "reopen_slot";
  status: string;
  current_state: { status: string; candidates: string[]; note: string | null };
  proposed_state: { status: string; candidates: string[]; note: string | null };
  rationale: string;
  evidence: CampProposalEvidence[];
  confidence: "low" | "medium" | "high";
  created_at: string;
};

const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function fetchPendingCampProposals(
  teamAbbr?: string | null
): Promise<CampBattleProposal[]> {
  const sb = createServerClient();
  let q = sb
    .from("camp_battle_proposals")
    .select("*")
    .eq("season", 2026)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (teamAbbr) q = q.eq("team_abbr", teamAbbr);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as CampBattleProposal[];
  return rows.sort(
    (a, b) =>
      (CONFIDENCE_RANK[a.confidence] ?? 3) - (CONFIDENCE_RANK[b.confidence] ?? 3)
  );
}

export type SlotMomentum = {
  team_abbr: string;
  slot: string;
  position: string;
  status: string;
  note: string | null;
  candidates: CampScoreRow[];
  leader: CampScoreRow | null;
  spread: number;
};

export function buildSlotMomentum(
  battles: CampBattleRow[],
  scores: CampScoreRow[]
): SlotMomentum[] {
  const bySlot = new Map<string, CampScoreRow[]>();
  for (const s of scores) {
    const key = `${s.team_abbr}:${s.slot}`;
    const list = bySlot.get(key) ?? [];
    list.push(s);
    bySlot.set(key, list);
  }

  const out: SlotMomentum[] = [];
  for (const b of battles) {
    const key = `${b.team_abbr}:${b.slot}`;
    const candScores = (bySlot.get(key) ?? []).sort(
      (a, c) => Number(c.score) - Number(a.score)
    );
    const leader = candScores[0] ?? null;
    const runner = candScores[1];
    const spread =
      leader && runner
        ? Number(leader.score) - Number(runner.score)
        : leader
          ? Number(leader.score)
          : 0;
    out.push({
      team_abbr: b.team_abbr,
      slot: b.slot,
      position: b.position,
      status: b.status,
      note: b.note,
      candidates: candScores,
      leader,
      spread,
    });
  }

  return out.sort((a, b) => {
    const aScore = Math.abs(a.leader?.score ?? 0);
    const bScore = Math.abs(b.leader?.score ?? 0);
    return bScore - aScore;
  });
}

/** Group rows by team_abbr so same-club signals/proposals review together. */
export function groupByTeamAbbr<T extends { team_abbr: string }>(
  rows: T[]
): { team: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.team_abbr) ?? [];
    list.push(row);
    map.set(row.team_abbr, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([team, items]) => ({ team, items }));
}
