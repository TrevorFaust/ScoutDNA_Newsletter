import { createServerClient } from "@/lib/supabase";
import type { UsageSeasonType } from "@/lib/playerUsage";

export type TeamGame = {
  week: number;
  /** Site abbrev (LAR, WAS, ARI), uppercase. */
  opponent: string;
  home: boolean | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  result: "W" | "L" | "T" | null;
};

/** Keyed by site abbrev (LAR, WAS, ARI), uppercase. */
export type TeamGamesByTeam = Record<string, TeamGame[]>;

const SITE_ABBREV: Record<string, string> = { LA: "LAR", AZ: "ARI", WSH: "WAS" };

export function siteTeamAbbrev(abbrev: string) {
  const upper = abbrev.toUpperCase();
  return SITE_ABBREV[upper] ?? upper;
}

type ResultRow = {
  week: number;
  team_abbr: string;
  opponent_abbr: string;
  home: boolean | null;
  points_for: number | null;
  points_against: number | null;
  result: "W" | "L" | "T" | null;
};

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expires: number; value: Promise<TeamGamesByTeam> }>();

/** Every scheduled game for the slice. Opponents only; filter to played weeks at the call site. */
export function fetchTeamGames(
  season: number,
  seasonType: UsageSeasonType
): Promise<TeamGamesByTeam> {
  const key = `${season}:${seasonType}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = loadTeamGames(season, seasonType);
  cache.set(key, { expires: Date.now() + TTL_MS, value });
  value.catch(() => cache.delete(key));
  return value;
}

async function loadTeamGames(
  season: number,
  seasonType: UsageSeasonType
): Promise<TeamGamesByTeam> {
  const { data, error } = await createServerClient()
    .from("team_week_results")
    .select("week,team_abbr,opponent_abbr,home,points_for,points_against,result")
    .eq("season", season)
    .eq("season_type", seasonType)
    .order("week");
  if (error) throw error;
  const out: TeamGamesByTeam = {};
  for (const row of (data ?? []) as ResultRow[]) {
    (out[siteTeamAbbrev(row.team_abbr)] ??= []).push({
      week: Number(row.week),
      opponent: siteTeamAbbrev(row.opponent_abbr),
      home: row.home,
      pointsFor: row.points_for,
      pointsAgainst: row.points_against,
      result: row.result,
    });
  }
  return out;
}

export function gamesInWeeks(games: TeamGamesByTeam, weeks: number[]): TeamGamesByTeam {
  const wanted = new Set(weeks);
  const out: TeamGamesByTeam = {};
  for (const [team, list] of Object.entries(games)) {
    const kept = list.filter((g) => wanted.has(g.week));
    if (kept.length) out[team] = kept;
  }
  return out;
}

export type TeamRecord = {
  wins: number;
  losses: number;
  ties: number;
  pointDiff: number;
};

/** W-L-T through `throughWeek`, counting only games with a recorded result. */
export function recordsThroughWeek(
  games: TeamGamesByTeam,
  throughWeek: number
): Record<string, TeamRecord> {
  const out: Record<string, TeamRecord> = {};
  for (const [team, list] of Object.entries(games)) {
    const rec: TeamRecord = { wins: 0, losses: 0, ties: 0, pointDiff: 0 };
    for (const g of list) {
      if (g.week > throughWeek) continue;
      if (g.result === "W") rec.wins += 1;
      else if (g.result === "L") rec.losses += 1;
      else if (g.result === "T") rec.ties += 1;
      else continue;
      rec.pointDiff += (g.pointsFor ?? 0) - (g.pointsAgainst ?? 0);
    }
    out[team] = rec;
  }
  return out;
}

export function formatRecord(rec: TeamRecord): string {
  if (rec.ties > 0) return `${rec.wins}-${rec.losses}-${rec.ties}`;
  return `${rec.wins}-${rec.losses}`;
}

/** NFL-style: winning percentage, then wins, then point differential. */
export function compareStandings(a: TeamRecord, b: TeamRecord): number {
  const pct = (r: TeamRecord) => {
    const games = r.wins + r.losses + r.ties;
    return games ? (r.wins + 0.5 * r.ties) / games : 0;
  };
  const byPct = pct(b) - pct(a);
  if (byPct !== 0) return byPct;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return b.pointDiff - a.pointDiff;
}
