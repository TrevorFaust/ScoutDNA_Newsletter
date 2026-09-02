import Link from "next/link";
import {
  loadUsagePage,
  fetchUsageMeta,
  USAGE_TYPES,
  type PlayerWeekUsage,
  type UsageSeasonType,
} from "@/lib/playerUsage";
import { getTeams } from "@/lib/teams";

export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined, digits = 1) {
  if (n == null) return "";
  return Number(n).toFixed(digits);
}

function preseasonWeekLabel(week: number) {
  if (week === 0) return "HOF";
  return `Week ${week}`;
}

function weekHeading(week: number, seasonType: UsageSeasonType) {
  if (seasonType === "PRE") return preseasonWeekLabel(week);
  return `Week ${week}`;
}

function UsageTable({ rows }: { rows: PlayerWeekUsage[] }) {
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th>Snap%</th>
            <th>Rush share</th>
            <th>Carries</th>
            <th>Targets</th>
            <th>Target%</th>
            <th>Air%</th>
            <th>Receptions</th>
            <th>PPR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.gsis_id}>
              <td>{r.player_name}</td>
              <td>{r.position}</td>
              <td>{fmt(r.snap_pct, 0)}</td>
              <td>{fmt(r.rush_share, 0)}</td>
              <td>{r.carries ?? ""}</td>
              <td>{r.targets ?? ""}</td>
              <td>{fmt(r.target_share, 0)}</td>
              <td>{fmt(r.air_yards_share, 0)}</td>
              <td>{r.receptions ?? ""}</td>
              <td>{fmt(r.fantasy_points_ppr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnKey() {
  return (
    <dl className="usage-column-key">
      <div>
        <dt>Snap%</dt>
        <dd>
          Share of the team&apos;s offensive snaps this player was on the field.
          Season to date uses total snaps over the season, not an average of
          weekly percentages. Blank on ESPN preseason rows until nflverse
          publishes snap counts.
        </dd>
      </div>
      <div>
        <dt>Rush share</dt>
        <dd>Share of all team carries (QB, RB, WR, anyone with a handoff).</dd>
      </div>
      <div>
        <dt>Target%</dt>
        <dd>
          Share of team targets on pass plays. How often the ball is thrown their
          way vs other WRs/TEs/RBs.
        </dd>
      </div>
      <div>
        <dt>Air%</dt>
        <dd>
          Share of team air yards (intended throw distance on targets). Screens and
          swings behind the line count as negative, so checkdowns often show below
          zero. Deep targets can land over 100% in the same game because those
          negatives shrink the team total. Same definition nflverse uses. Blank
          on ESPN preseason rows.
        </dd>
      </div>
      <div>
        <dt>PPR</dt>
        <dd>Fantasy points in standard PPR scoring.</dd>
      </div>
    </dl>
  );
}

export default async function UsageAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    season_type?: string;
    week?: string;
    team?: string;
  }>;
}) {
  const params = await searchParams;
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
  const weekParam = params.week ? Number(params.week) : latest?.week ?? null;
  const team = params.team?.toUpperCase() || null;
  const teams = getTeams();

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

  return (
    <main className="camp-admin usage-admin">
      <header className="camp-admin-header">
        <div>
          <p className="camp-admin-eyebrow">Admin</p>
          <h1>Skill usage</h1>
          <p className="camp-admin-lead">
            nflverse PPR box scores plus snap, rush, target, and air-yard shares.
            Preseason 2026 falls back to ESPN boxes (carries, targets, rec, yards, PPR)
            until nflverse publishes that file. Compose cites 2026 rows on named
            storylines. PRE leftover camp-body shares are not job proof; a 4-catch
            line on a player the beat already wrote up is.
          </p>
        </div>
        <div className="usage-header-links">
          <Link href="/admin/rumors" className="btn btn-secondary">
            Rumors
          </Link>
          <Link href="/admin/camp-signals" className="btn btn-secondary">
            Camp signals
          </Link>
        </div>
      </header>

      {loadError && (
        <p className="alert">
          {loadError}. Run migration 018 and{" "}
          <code>.\scripts\sync_nflverse.ps1 -UsageOnly</code>.
        </p>
      )}

      <form className="usage-filters" method="get">
        <label>
          Season
          <select name="season" defaultValue={String(season)}>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select name="season_type" defaultValue={seasonType}>
            {USAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Week
          <select name="week" defaultValue={week == null ? "" : String(week)}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {seasonType === "PRE" ? preseasonWeekLabel(w) : w}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team
          <select name="team" defaultValue={team ?? ""}>
            <option value="">All 32</option>
            {teams.map((t) => (
              <option key={t.abbrev} value={t.abbrev.toUpperCase()}>
                {t.abbrev.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Apply
        </button>
      </form>

      {page && page.weekGroups.length === 0 && !loadError && (
        <p className="camp-admin-muted">
          No {season} {seasonType} usage yet. Regular season comes from nflverse;
          2026 preseason comes from ESPN until nflverse publishes PRE. Sync with{" "}
          <code>.\scripts\sync_nflverse.ps1 -UsageOnly</code>.
        </p>
      )}

      {page && page.weekGroups.length > 0 && (
        <section className="camp-admin-card">
          <h2>
            {weekHeading(page.week ?? 0, seasonType)} · {season} {seasonType}
          </h2>
          <ColumnKey />
          <div className="camp-team-groups">
            {page.weekGroups.map((g) => (
              <section key={g.team} className="camp-team-group">
                <h3 className="camp-team-group-title">{g.team}</h3>
                <UsageTable rows={g.items} />
              </section>
            ))}
          </div>
        </section>
      )}

      {page && page.stdGroups.length > 0 && team && (
        <section className="camp-admin-card">
          <h2>
            Season to date · {season} {seasonType}
          </h2>
          <p className="camp-admin-muted">
            Totals for PPR, carries, targets, and receptions. Snap%, rush share,
            Target%, and Air% are true season shares (player total ÷ team
            season total), not averages of weekly percentages.
          </p>
          <div className="camp-team-groups">
            {page.stdGroups.map((g) => (
              <section key={g.team} className="camp-team-group">
                <h3 className="camp-team-group-title">{g.team}</h3>
                <UsageTable rows={g.items} />
              </section>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
