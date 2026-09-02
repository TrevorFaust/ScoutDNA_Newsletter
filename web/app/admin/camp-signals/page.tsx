import Link from "next/link";
import { CampProposalCard } from "@/components/CampProposalActions";
import {
  buildSlotMomentum,
  fetchCampBattles,
  fetchCampSlotScores,
  fetchPendingCampProposals,
  fetchRecentCampSignals,
  groupByTeamAbbr,
} from "@/lib/campSignals";
import { getTeams } from "@/lib/teams";

export const dynamic = "force-dynamic";

function trendLabel(trend: string) {
  if (trend === "rising") return "↑ rising";
  if (trend === "falling") return "↓ falling";
  return "→ flat";
}

function directionMark(direction: string) {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  return "·";
}

export default async function CampSignalsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const params = await searchParams;
  const team = params.team?.toUpperCase() || null;
  const teams = getTeams();

  let battles: Awaited<ReturnType<typeof fetchCampBattles>> = [];
  let scores: Awaited<ReturnType<typeof fetchCampSlotScores>> = [];
  let signals: Awaited<ReturnType<typeof fetchRecentCampSignals>> = [];
  let proposals: Awaited<ReturnType<typeof fetchPendingCampProposals>> = [];
  let loadError: string | null = null;

  try {
    [battles, scores, signals, proposals] = await Promise.all([
      fetchCampBattles(team),
      fetchCampSlotScores(7, team),
      fetchRecentCampSignals(team ? 120 : 60, team),
      fetchPendingCampProposals(team),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load camp signals";
  }

  const slots = buildSlotMomentum(battles, scores);
  const notable = slots.filter(
    (s) =>
      (s.leader?.signal_count ?? 0) > 0 ||
      Math.abs(s.leader?.score ?? 0) >= 2
  );
  const proposalsByTeam = groupByTeamAbbr(proposals);
  const signalsByTeam = groupByTeamAbbr(signals);
  const notableByTeam = groupByTeamAbbr(notable);
  const refreshHref = team
    ? `/admin/camp-signals?team=${encodeURIComponent(team)}`
    : "/admin/camp-signals";

  return (
    <main className="camp-admin">
      <header className="camp-admin-header">
        <div>
          <p className="camp-admin-eyebrow">Admin</p>
          <h1>Camp signal tracker</h1>
          <p className="camp-admin-lead">
            Rolling 7-day momentum for contested position battles. Signals extract and
            proposals refresh nightly after collect — nothing touches{" "}
            <code>fantasy_position_battles</code> until you approve it below.
          </p>
        </div>
        <div className="usage-header-links">
          <Link href="/admin/usage" className="btn btn-secondary">
            Usage
          </Link>
          <Link href={refreshHref} className="btn btn-secondary">
            Refresh
          </Link>
        </div>
      </header>

      {loadError && (
        <p className="alert">
          {loadError}. Run migration 016 and{" "}
          <code>.\scripts\extract_camp_signals.ps1</code> after collect.
        </p>
      )}

      <form className="usage-filters" method="get">
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

      <section className="camp-admin-card">
        <h2>Pending proposals ({proposals.length})</h2>
        <p className="camp-admin-muted">
          Settle, lean, narrow, or reopen suggestions backed by camp reporting.
          Approve applies it to the live battle immediately; reject or snooze leaves
          the battle unchanged.
        </p>
        {proposals.length === 0 ? (
          <p className="camp-admin-muted">
            {team
              ? `No pending proposals for ${team}.`
              : "Nothing pending right now — check back after tonight's collect, or once camp reporting picks up."}
          </p>
        ) : (
          <div className="camp-team-groups">
            {proposalsByTeam.map(({ team: teamKey, items }) => (
              <section key={teamKey} className="camp-team-group">
                <h3 className="camp-team-group-title">
                  {teamKey}{" "}
                  <span className="camp-admin-muted">({items.length})</span>
                </h3>
                <ul className="camp-proposal-list">
                  {items.map((p) => (
                    <CampProposalCard key={p.id} proposal={p} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="camp-admin-card">
        <h2>Battles of note ({notable.length})</h2>
        <p className="camp-admin-muted">
          Contested/open slots with camp activity or meaningful score separation.
          Trend is recent-window buzz: rising if the last half of the 7-day window
          is clearly positive, falling if clearly negative — not a comparison to
          the older half.
        </p>
        {notable.length === 0 ? (
          <p className="camp-admin-muted">
            {team
              ? `No scored battles for ${team} yet.`
              : "No scored battles yet. Run collect, then extract_camp_signals."}
          </p>
        ) : (
          <div className="camp-team-groups">
            {notableByTeam.map(({ team: teamKey, items }) => (
              <section key={teamKey} className="camp-team-group">
                <h3 className="camp-team-group-title">{teamKey}</h3>
                <ul className="camp-slot-list">
                  {items.map((slot) => (
                    <li
                      key={`${slot.team_abbr}-${slot.slot}`}
                      className="camp-slot-item"
                    >
                      <div className="camp-slot-head">
                        <strong>
                          {slot.team_abbr} · {slot.slot}
                        </strong>
                        <span className="camp-slot-badge">{slot.status}</span>
                        {slot.spread >= 5 && (
                          <span className="camp-slot-badge camp-slot-badge-warn">
                            gap {slot.spread.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {slot.note && (
                        <p className="camp-admin-muted">{slot.note}</p>
                      )}
                      <table className="camp-score-table">
                        <thead>
                          <tr>
                            <th>Player</th>
                            <th>Score</th>
                            <th>Signals</th>
                            <th>Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slot.candidates.map((c) => (
                            <tr key={c.player_name}>
                              <td>{c.player_name}</td>
                              <td
                                className={
                                  Number(c.score) > 0
                                    ? "camp-score-up"
                                    : Number(c.score) < 0
                                      ? "camp-score-down"
                                      : ""
                                }
                              >
                                {Number(c.score).toFixed(1)}
                              </td>
                              <td>
                                {c.signal_count} ({c.up_count}↑ {c.down_count}↓)
                              </td>
                              <td>{trendLabel(c.trend)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="camp-admin-card">
        <h2>Recent signals</h2>
        {signals.length === 0 ? (
          <p className="camp-admin-muted">
            {team
              ? `No extracted signals for ${team} yet.`
              : "No extracted signals yet."}
          </p>
        ) : (
          <div className="camp-team-groups">
            {signalsByTeam.map(({ team: teamKey, items }) => (
              <section key={teamKey} className="camp-team-group">
                <h3 className="camp-team-group-title">
                  {teamKey}{" "}
                  <span className="camp-admin-muted">({items.length})</span>
                </h3>
                <ul className="camp-signal-feed">
                  {items.map((s) => (
                    <li key={s.id} className="camp-signal-item">
                      <div className="camp-signal-meta">
                        <span>{s.content_date}</span>
                        <span>
                          {s.team_abbr} {s.slot}
                        </span>
                        <span>
                          {directionMark(s.direction)} {s.player_name}
                        </span>
                        <span>t{s.source_tier}</span>
                      </div>
                      <p>{s.summary}</p>
                      {s.source_url && (
                        <a href={s.source_url} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
