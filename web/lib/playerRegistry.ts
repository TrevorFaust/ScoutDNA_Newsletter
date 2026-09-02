import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePlayerKey, normalizePosition, type FantasyPosition } from "./positions";

export type PlayerLookupEntry = {
  displayName: string;
  position: FantasyPosition;
  normalized: string;
  teamAbbr?: string;
};

export type PlayerPositionLookup = {
  byNormalized: Map<string, PlayerLookupEntry>;
  byLength: PlayerLookupEntry[];
};

function addPlayer(
  map: Map<string, PlayerLookupEntry>,
  name: string,
  position: string | null | undefined,
  opts?: { force?: boolean; teamAbbr?: string | null }
) {
  const pos = normalizePosition(position);
  if (!pos || !name?.trim()) return;
  const displayName = name.trim();
  const normalized = normalizePlayerKey(displayName);
  if (!normalized) return;
  const teamAbbr = opts?.teamAbbr?.trim().toUpperCase() || undefined;
  const existing = map.get(normalized);
  if (!existing || opts?.force) {
    map.set(normalized, {
      displayName,
      position: pos,
      normalized,
      teamAbbr: teamAbbr ?? existing?.teamAbbr,
    });
    return;
  }
  // Prefer longer display form; do not silently change position on length bump
  // unless the incoming row is the same role family upgrade (keep first pos).
  if (existing.displayName.length < displayName.length) {
    map.set(normalized, {
      displayName,
      position: existing.position,
      normalized,
      teamAbbr: existing.teamAbbr ?? teamAbbr,
    });
    return;
  }
  if (!existing.teamAbbr && teamAbbr) {
    map.set(normalized, { ...existing, teamAbbr });
  }
}

/** Supabase caps un-ranged selects at 1000 rows; rosters_2026 alone has 2000+. Page through everything. */
const PAGE_SIZE = 1000;

type NameRow = { name: string | null; position: string | null; teamAbbr?: string | null };

async function fetchAllNameRows(
  buildPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: Record<string, unknown>[] | null }>,
  nameCol: string,
  posCol: string,
  teamCol?: string
): Promise<NameRow[]> {
  const rows: NameRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await buildPage(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    for (const row of data) {
      rows.push({
        name: row[nameCol] as string | null,
        position: row[posCol] as string | null,
        teamAbbr: teamCol ? (row[teamCol] as string | null) : null,
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

  const [rosters, rookies, olDepth, fantasyDepth, draftPicks, knownPlayers, usage, coaching] =
    await Promise.all([
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("rosters_2026")
          .select("full_name, position, team_abbr")
          .order("full_name")
          .range(from, to),
      "full_name",
      "position",
      "team_abbr"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("rookies_2026")
          .select("player_name, position, nfl_team")
          .order("player_name")
          .range(from, to),
      "player_name",
      "position",
      "nfl_team"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("depth_charts_2026")
          .select("player_name, pos_abb, team_abbr")
          .in("pos_abb", ["LT", "RT", "LG", "RG", "C", "T", "G", "OT", "OG", "OL", "IOL"])
          .order("player_name")
          .range(from, to),
      "player_name",
      "pos_abb",
      "team_abbr"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("fantasy_team_depth")
          .select("player_name, position, team_abbr")
          .eq("season", 2026)
          .order("player_name")
          .range(from, to),
      "player_name",
      "position",
      "team_abbr"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("draft_picks_2026")
          .select("player_name, position, team_abbr")
          .order("player_name")
          .range(from, to),
      "player_name",
      "position",
      "team_abbr"
    ),
    // Recent DraftDNA players + usage fill midseason adds missing from nflverse rosters
    // (e.g. Stefon Diggs on PUP / a new signing not yet in roster_2026.parquet).
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("players")
          .select("name, position")
          .gte("season", 2024)
          .order("season", { ascending: false })
          .order("name")
          .range(from, to),
      "name",
      "position"
    ),
    fetchAllNameRows(
      (from, to) =>
        supabase
          .from("player_week_usage")
          .select("player_name, position")
          .order("player_name")
          .range(from, to),
      "player_name",
      "position"
    ),
    supabase.from("team_coaching_2026").select("team_abbr, hc_name, oc_name, dc_name, gm_name"),
  ]);

  // Current roster/depth wins. Known-player + usage rows only fill names those miss.
  for (const row of [
    ...rosters,
    ...rookies,
    ...olDepth,
    ...fantasyDepth,
    ...draftPicks,
    ...knownPlayers,
    ...usage,
  ]) {
    addPlayer(byNormalized, row.name ?? "", row.position, { teamAbbr: row.teamAbbr });
  }
  // Staff always wins over any accidental player-name collision.
  for (const row of coaching.data ?? []) {
    for (const name of [row.hc_name, row.oc_name, row.dc_name, row.gm_name] as string[]) {
      addPlayer(byNormalized, name, "COACH", {
        force: true,
        teamAbbr: row.team_abbr as string | undefined,
      });
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
