import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePlayerKey, normalizePosition, type FantasyPosition } from "./positions";

export type PlayerLookupEntry = {
  displayName: string;
  position: FantasyPosition;
  normalized: string;
};

export type PlayerPositionLookup = {
  byNormalized: Map<string, PlayerLookupEntry>;
  byLength: PlayerLookupEntry[];
};

function addPlayer(
  map: Map<string, PlayerLookupEntry>,
  name: string,
  position: string | null | undefined
) {
  const pos = normalizePosition(position);
  if (!pos || !name?.trim()) return;
  const displayName = name.trim();
  const normalized = normalizePlayerKey(displayName);
  if (!normalized) return;
  const existing = map.get(normalized);
  if (!existing) {
    map.set(normalized, { displayName, position: pos, normalized });
    return;
  }
  if (existing.displayName.length < displayName.length) {
    map.set(normalized, { displayName, position: pos, normalized });
  }
}

/** Supabase caps un-ranged selects at 1000 rows; rosters_2026 alone has 2000+. Page through everything. */
const PAGE_SIZE = 1000;

type NameRow = { name: string | null; position: string | null };

async function fetchAllNameRows(
  buildPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: Record<string, unknown>[] | null }>,
  nameCol: string,
  posCol: string
): Promise<NameRow[]> {
  const rows: NameRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await buildPage(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    for (const row of data) {
      rows.push({
        name: row[nameCol] as string | null,
        position: row[posCol] as string | null,
      });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchPlayerPositionLookup(
  supabase: SupabaseClient
): Promise<PlayerPositionLookup> {
  const byNormalized = new Map<string, PlayerLookupEntry>();

  const [rosters, rookies, olDepth, fantasyDepth, draftPicks, coaching] = await Promise.all([
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("rosters_2026")
          .select("full_name, position")
          .order("full_name")
          .range(from, to),
      "full_name",
      "position"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("rookies_2026")
          .select("player_name, position")
          .order("player_name")
          .range(from, to),
      "player_name",
      "position"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("depth_charts_2026")
          .select("player_name, pos_abb")
          .in("pos_abb", ["LT", "RT", "LG", "RG", "C", "T", "G", "OT", "OG", "OL", "IOL"])
          .order("player_name")
          .range(from, to),
      "player_name",
      "pos_abb"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("fantasy_team_depth")
          .select("player_name, position")
          .eq("season", 2026)
          .order("player_name")
          .range(from, to),
      "player_name",
      "position"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("draft_picks_2026")
          .select("player_name, position")
          .order("player_name")
          .range(from, to),
      "player_name",
      "position"
    ),
    supabase
      .from("team_coaching_2026")
      .select("hc_name, oc_name, dc_name, gm_name"),
  ]);

  for (const row of [...rosters, ...rookies, ...olDepth, ...fantasyDepth, ...draftPicks]) {
    addPlayer(byNormalized, row.name ?? "", row.position);
  }
  for (const row of coaching.data ?? []) {
    for (const name of [row.hc_name, row.oc_name, row.dc_name, row.gm_name] as string[]) {
      addPlayer(byNormalized, name, "COACH");
    }
  }

  const byLength = [...byNormalized.values()].sort(
    (a, b) => b.displayName.length - a.displayName.length
  );

  return { byNormalized, byLength };
}

/** Serializable for passing from Server Component to client. */
export function serializePlayerLookup(lookup: PlayerPositionLookup): PlayerLookupEntry[] {
  return lookup.byLength;
}

export function deserializePlayerLookup(entries: PlayerLookupEntry[]): PlayerPositionLookup {
  const byNormalized = new Map<string, PlayerLookupEntry>();
  for (const e of entries) {
    byNormalized.set(e.normalized, e);
  }
  const byLength = [...byNormalized.values()].sort(
    (a, b) => b.displayName.length - a.displayName.length
  );
  return { byNormalized, byLength };
}
