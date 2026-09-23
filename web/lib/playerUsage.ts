import { createServerClient } from "@/lib/supabase";

export const USAGE_SEASONS = [2026, 2025] as const;
export const USAGE_TYPES = ["PRE", "REG", "POST"] as const;

export type UsageSeasonType = (typeof USAGE_TYPES)[number];

export type PlayerWeekUsage = {
  season: number;
  season_type: UsageSeasonType;
  week: number;
  team_abbr: string;
  gsis_id: string;
  player_name: string;
  position: string;
  offense_snaps: number | null;
  snap_pct: number | null;
  pass_attempts: number | null;
  passing_yards: number | null;
  passing_tds: number | null;
  interceptions: number | null;
  carries: number | null;
  rushing_yards: number | null;
  rushing_tds: number | null;
  targets: number | null;
  receptions: number | null;
  receiving_yards: number | null;
  receiving_tds: number | null;
  receiving_air_yards: number | null;
  fantasy_points_ppr: number | null;
  rush_share: number | null;
  rb_rush_share: number | null;
  target_share: number | null;
  air_yards_share: number | null;
  touch_share: number | null;
  team_carries: number | null;
  team_targets: number | null;
  team_air_yards: number | null;
};

export type UsageFlag =
  | "split_backfield"
  | "target_leader"
  | "wr_target_split"
  | "te_featured";

export type UsageFilters = {
  season: number;
  seasonType: UsageSeasonType;
  week: number | null;
  team: string | null;
};

const PAGE = 1000;

async function fetchAllUsage(
  season: number,
  seasonType: UsageSeasonType,
  team?: string | null
): Promise<PlayerWeekUsage[]> {
  const sb = createServerClient();
  const rows: PlayerWeekUsage[] = [];
  for (let from = 0; from < 8000; from += PAGE) {
    let q = sb
      .from("player_week_usage")
      .select(
        "season,season_type,week,team_abbr,gsis_id,player_name,position,offense_snaps,snap_pct,pass_attempts,passing_yards,passing_tds,interceptions,carries,rushing_yards,rushing_tds,targets,receptions,receiving_yards,receiving_tds,receiving_air_yards,fantasy_points_ppr,rush_share,rb_rush_share,target_share,air_yards_share,touch_share,team_carries,team_targets,team_air_yards"
      )
      .eq("season", season)
      .eq("season_type", seasonType)
      .order("team_abbr")
      .order("week")
      .range(from, from + PAGE - 1);
    if (team) {
      const aliases: Record<string, string[]> = {
        LAR: ["LAR", "LA"],
        LA: ["LA", "LAR"],
        ARI: ["ARI", "AZ"],
        AZ: ["AZ", "ARI"],
        WAS: ["WAS", "WSH"],
        WSH: ["WSH", "WAS"],
      };
      const abbrs = aliases[team.toUpperCase()] ?? [team];
      q = q.in("team_abbr", abbrs);
    }
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as PlayerWeekUsage[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function fetchUsageMeta(): Promise<{
  seasons: number[];
  latest: { season: number; seasonType: UsageSeasonType; week: number } | null;
}> {
  const sb = createServerClient();
  const { data, error } = await sb
    .from("player_week_usage")
    .select("season,season_type,week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(4000);
  if (error) throw error;
  const rows = data ?? [];
  const seasons = [...new Set(rows.map((r) => Number(r.season)))].sort(
    (a, b) => b - a
  );
  const prefer = (t: string) => (t === "REG" ? 2 : t === "PRE" ? 1 : 0);
  let latest: { season: number; seasonType: UsageSeasonType; week: number } | null =
    null;
  for (const r of rows) {
    const candidate = {
      season: Number(r.season),
      seasonType: r.season_type as UsageSeasonType,
      week: Number(r.week),
    };
    if (
      !latest ||
      candidate.season > latest.season ||
      (candidate.season === latest.season &&
        prefer(candidate.seasonType) > prefer(latest.seasonType)) ||
      (candidate.season === latest.season &&
        candidate.seasonType === latest.seasonType &&
        candidate.week > latest.week)
    ) {
      latest = candidate;
    }
  }
  return { seasons: seasons.length ? seasons : [...USAGE_SEASONS], latest };
}

/** One REG/PRE/POST week for all teams (or one team). Used on weekly issue pages. */
export async function fetchUsageForWeek(opts: {
  season: number;
  seasonType?: UsageSeasonType;
  week: number;
  team?: string | null;
}): Promise<PlayerWeekUsage[]> {
  const seasonType = opts.seasonType ?? "REG";
  const all = await fetchAllUsage(opts.season, seasonType, opts.team);
  return all.filter((r) => Number(r.week) === opts.week);
}

/** Group by canonical team abbr (LAR/ARI/WAS). */
export function usageByTeamAbbr(
  rows: PlayerWeekUsage[]
): Record<string, PlayerWeekUsage[]> {
  const aliases: Record<string, string> = {
    LA: "LAR",
    AZ: "ARI",
    WSH: "WAS",
  };
  const map: Record<string, PlayerWeekUsage[]> = {};
  for (const row of rows) {
    const abbr = aliases[row.team_abbr] ?? row.team_abbr;
    (map[abbr] ??= []).push(row);
  }
  return map;
}

export function usageFlags(weekRows: PlayerWeekUsage[]): UsageFlag[] {
  const flags: UsageFlag[] = [];
  const rbs = weekRows
    .filter((r) => r.position === "RB")
    .toSorted((a, b) => (b.rush_share ?? 0) - (a.rush_share ?? 0));
  if (rbs.length >= 2) {
    const lead = rbs[0].rush_share ?? 0;
    const second = rbs[1].rush_share ?? 0;
    // Team carry share: workhorse RBs often sit ~50–65%. Split if lead is light or #2 is heavy.
    if (lead < 45 || second >= 25) flags.push("split_backfield");
  }
  const catchers = weekRows
    .filter((r) => r.position === "WR" || r.position === "TE")
    .toSorted((a, b) => (b.target_share ?? 0) - (a.target_share ?? 0));
  if (catchers[0] && (catchers[0].target_share ?? 0) >= 22) {
    flags.push("target_leader");
  }
  if (
    catchers.length >= 2 &&
    (catchers[0].target_share ?? 0) >= 12 &&
    (catchers[0].target_share ?? 0) - (catchers[1].target_share ?? 0) <= 8
  ) {
    flags.push("wr_target_split");
  }
  if (weekRows.some((r) => r.position === "TE" && (r.target_share ?? 0) >= 18)) {
    flags.push("te_featured");
  }
  return flags;
}

export function groupUsageByTeam(rows: PlayerWeekUsage[]) {
  const map = new Map<string, PlayerWeekUsage[]>();
  for (const row of rows) {
    const list = map.get(row.team_abbr) ?? [];
    list.push(row);
    map.set(row.team_abbr, list);
  }
  return [...map.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([team, items]) => ({
      team,
      items: items.toSorted((a, b) => {
        const pos = a.position.localeCompare(b.position);
        if (pos) return pos;
        return (b.fantasy_points_ppr ?? 0) - (a.fantasy_points_ppr ?? 0);
      }),
      flags: usageFlags(items),
    }));
}

function weekKey(team: string, week: number) {
  return `${team}:${week}`;
}

function impliedTeamSnaps(row: PlayerWeekUsage): number | null {
  const snaps = row.offense_snaps;
  const pct = row.snap_pct;
  if (snaps == null || pct == null || pct <= 0) return null;
  return snaps / (pct / 100);
}

/**
 * True season shares: player totals / team season totals.
 * Averaging weekly snap% inflated backups who only played one game at a high rate.
 */
export function seasonToDate(rows: PlayerWeekUsage[]): PlayerWeekUsage[] {
  const teamWeek = new Map<
    string,
    { carries: number; targets: number; air: number; snaps: number }
  >();

  for (const row of rows) {
    const key = weekKey(row.team_abbr, row.week);
    const cur = teamWeek.get(key) ?? {
      carries: 0,
      targets: 0,
      air: 0,
      snaps: 0,
    };
    if (row.team_carries != null) cur.carries = Number(row.team_carries);
    if (row.team_targets != null) cur.targets = Number(row.team_targets);
    if (row.team_air_yards != null) cur.air = Number(row.team_air_yards);
    const implied = impliedTeamSnaps(row);
    if (implied != null && implied > cur.snaps) cur.snaps = implied;
    teamWeek.set(key, cur);
  }

  const teamSeason = new Map<
    string,
    { carries: number; targets: number; air: number; snaps: number }
  >();
  for (const [key, week] of teamWeek) {
    const team = key.split(":")[0];
    const cur = teamSeason.get(team) ?? {
      carries: 0,
      targets: 0,
      air: 0,
      snaps: 0,
    };
    cur.carries += week.carries;
    cur.targets += week.targets;
    cur.air += week.air;
    cur.snaps += week.snaps;
    teamSeason.set(team, cur);
  }

  const acc = new Map<
    string,
    PlayerWeekUsage & { _snaps: number; _air: number }
  >();
  for (const row of rows) {
    const key = `${row.team_abbr}:${row.gsis_id}`;
    const cur = acc.get(key);
    if (!cur) {
      acc.set(key, {
        ...row,
        week: 0,
        carries: row.carries ?? 0,
        targets: row.targets ?? 0,
        receptions: row.receptions ?? 0,
        rushing_yards: row.rushing_yards ?? 0,
        receiving_yards: row.receiving_yards ?? 0,
        fantasy_points_ppr: row.fantasy_points_ppr ?? 0,
        _snaps: row.offense_snaps ?? 0,
        _air: row.receiving_air_yards ?? 0,
      });
      continue;
    }
    cur.carries = (cur.carries ?? 0) + (row.carries ?? 0);
    cur.targets = (cur.targets ?? 0) + (row.targets ?? 0);
    cur.receptions = (cur.receptions ?? 0) + (row.receptions ?? 0);
    cur.rushing_yards = (cur.rushing_yards ?? 0) + (row.rushing_yards ?? 0);
    cur.receiving_yards =
      (cur.receiving_yards ?? 0) + (row.receiving_yards ?? 0);
    cur.fantasy_points_ppr =
      (cur.fantasy_points_ppr ?? 0) + (row.fantasy_points_ppr ?? 0);
    cur._snaps += row.offense_snaps ?? 0;
    cur._air += row.receiving_air_yards ?? 0;
  }

  return [...acc.values()].map((row) => {
    const team = teamSeason.get(row.team_abbr);
    const snapPct =
      team && team.snaps > 0 ? round1((row._snaps / team.snaps) * 100) : null;
    const rushShare =
      team && team.carries > 0
        ? round1(((row.carries ?? 0) / team.carries) * 100)
        : null;
    const targetShare =
      team && team.targets > 0
        ? round1(((row.targets ?? 0) / team.targets) * 100)
        : null;
    const airShare =
      team && team.air !== 0 ? round1((row._air / team.air) * 100) : null;
    return {
      ...row,
      snap_pct: snapPct,
      rush_share: rushShare,
      target_share: targetShare,
      air_yards_share: airShare,
      fantasy_points_ppr: round1(row.fantasy_points_ppr),
    };
  });
}

function round1(n: number | null) {
  if (n == null) return null;
  return Math.round(n * 10) / 10;
}

function played(row: PlayerWeekUsage) {
  return (
    (row.snap_pct ?? 0) >= 10 ||
    (row.targets ?? 0) >= 1 ||
    (row.carries ?? 0) >= 1 ||
    (row.fantasy_points_ppr ?? 0) !== 0
  );
}

export async function loadUsagePage(filters: UsageFilters) {
  const all = await fetchAllUsage(
    filters.season,
    filters.seasonType,
    filters.team
  );
  const weeks = [...new Set(all.map((r) => r.week))].sort((a, b) => a - b);
  const week =
    filters.week && weeks.includes(filters.week)
      ? filters.week
      : (weeks.at(-1) ?? null);
  const weekRows =
    week == null ? [] : all.filter((r) => r.week === week && played(r));
  const stdGroups =
    filters.team != null
      ? groupUsageByTeam(seasonToDate(all).filter(played))
      : [];
  return {
    weeks,
    week,
    weekGroups: groupUsageByTeam(weekRows),
    stdGroups,
  };
}
