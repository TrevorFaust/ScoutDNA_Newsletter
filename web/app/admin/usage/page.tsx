import { UsageBoard } from "@/components/UsageBoard";
import { UsageFilters } from "@/components/UsageFilters";
import { getViewer } from "@/lib/auth";
import {
  loadUsagePage,
  fetchUsageMeta,
  USAGE_TYPES,
  type UsageSeasonType,
} from "@/lib/playerUsage";
import { fetchTeamGames, gamesInWeeks, type TeamGamesByTeam } from "@/lib/teamGames";
import { getTeams } from "@/lib/teams";
import { parseScoring, SCORING_OPTIONS } from "@/lib/usageDisplay";

export const dynamic = "force-dynamic";

function preseasonWeekLabel(week: number) {
  if (week === 0) return "HOF";
  return `Week ${week}`;
}

function weekHeading(
  week: number | "all",
  seasonType: UsageSeasonType,
  weeks: number[]
) {
  if (week === "all") {
    if (weeks.length === 0) return "All weeks";
    if (seasonType === "PRE") {
      const first = preseasonWeekLabel(weeks[0]);
      const last = preseasonWeekLabel(weeks[weeks.length - 1]);
      return weeks.length === 1 ? first : `${first}–${last}`;
    }
    return weeks.length === 1
      ? `Week ${weeks[0]}`
      : `Weeks ${weeks[0]}–${weeks[weeks.length - 1]}`;
  }
  if (seasonType === "PRE") return preseasonWeekLabel(week);
  return `Week ${week}`;
}

export default async function UsageAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    season_type?: string;
    week?: string;
    team?: string;
    scoring?: string;
  }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  let loadError: string | null = null;
  let meta: Awaited<ReturnType<typeof fetchUsageMeta>> | null = null;
  try {
    meta = await fetchUsageMeta();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load usage";
  }

  const latest = meta?.latest;
  const season = Number(params.season) || latest?.season || 2026;
  const seasonType = (
    USAGE_TYPES.includes(params.season_type as UsageSeasonType)
      ? params.season_type
      : latest?.seasonType || "REG"
  ) as UsageSeasonType;
  const weekParam =
    params.week === "all"
      ? ("all" as const)
      : params.week
        ? Number(params.week)
        : (latest?.week ?? null);
  const team = params.team?.toUpperCase() || null;
  const scoring = parseScoring(params.scoring);
  const teams = getTeams();
  const gamesPromise = fetchTeamGames(season, seasonType).catch(
    (): TeamGamesByTeam => ({})
  );

  let page: Awaited<ReturnType<typeof loadUsagePage>> | null = null;
  if (!loadError) {
    try {
      page = await loadUsagePage({
        season,
        seasonType,
        week: weekParam,
        team,
      });
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Failed to load usage";
    }
  }

  const seasons = meta?.seasons?.length ? meta.seasons : [season];
  const weeks = page?.weeks ?? [];
  const week = page?.week ?? weekParam;
  const shownWeeks =
    page?.week === "all" || team ? weeks : page?.week != null ? [page.week] : [];
  const games = gamesInWeeks(await gamesPromise, shownWeeks);

  return (
    <main className="camp-admin usage-admin">
      <header className="camp-admin-header usage-header">
        <div>
          <p className="camp-admin-eyebrow">{viewer?.isAdmin ? "Editor" : "Usage"}</p>
          <h1>Skill usage</h1>
          <p className="camp-admin-lead">
            Box scores tell you who scored, usage tells you who is about to.
            Check how your guys are really being deployed, catch the backup
            quietly eating into a starter&apos;s snaps, and find the receiver
            drawing targets his stat line hasn&apos;t caught up to yet.
          </p>
        </div>
      </header>

      {loadError && (
        <p className="alert">
          {loadError}. Run migration 018 and{" "}
          <code>.\scripts\sync_nflverse.ps1 -UsageOnly</code>.
        </p>
      )}

      <UsageFilters
        season={String(season)}
        seasonOptions={seasons.map((s) => ({ value: String(s), label: String(s) }))}
        seasonType={seasonType}
        seasonTypeOptions={USAGE_TYPES.map((t) => ({ value: t, label: t }))}
        week={week == null ? "" : String(week)}
        weekOptions={[
          { value: "all", label: "All weeks" },
          ...weeks.map((w) => ({
            value: String(w),
            label: seasonType === "PRE" ? preseasonWeekLabel(w) : String(w),
          })),
        ]}
        team={team ?? ""}
        teamOptions={[
          { value: "", label: "All 32" },
          ...teams
            .map((t) => t.abbrev.toUpperCase())
            .toSorted((a, b) => a.localeCompare(b))
            .map((abbrev) => ({ value: abbrev, label: abbrev })),
        ]}
        scoring={scoring}
        scoringOptions={SCORING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />

      {page && page.weekGroups.length === 0 && !loadError && (
        <p className="camp-admin-muted">
          No {season} {seasonType} usage yet. Regular season comes from nflverse;
          2026 preseason comes from ESPN until nflverse publishes PRE. Sync with{" "}
          <code>.\scripts\sync_nflverse.ps1 -UsageOnly</code>.
        </p>
      )}

      {page && (page.weekGroups.length > 0 || page.stdGroups.length > 0) && (
        <UsageBoard
          week={page.week ?? "all"}
          games={games}
          weekHeading={`${weekHeading(page.week ?? 0, seasonType, weeks)} · ${season} ${seasonType}`}
          weekNote={
            page.week === "all"
              ? "Counting stats are totals. Snap%, rush share, target share, and air-yard share use combined snaps and opportunities, not an average of the weekly percentages."
              : undefined
          }
          weekGroups={page.weekGroups}
          stdHeading={
            team
              ? `Season to date · ${season} ${seasonType}`
              : undefined
          }
          stdGroups={team ? page.stdGroups : []}
          scoring={scoring}
        />
      )}
    </main>
  );
}
