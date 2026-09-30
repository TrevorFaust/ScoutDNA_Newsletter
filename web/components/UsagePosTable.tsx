import type { PlayerWeekUsage } from "@/lib/playerUsage";
import {
  countOrDash,
  countOrZero,
  fantasyPoints,
  fmt,
  scoringColumn,
  type PosTab,
  type Scoring,
} from "@/lib/usageDisplay";

type Props = {
  rows: PlayerWeekUsage[];
  tab: PosTab;
  scoring?: Scoring;
};

export function UsagePosTable({ rows, tab, scoring = "ppr" }: Props) {
  const showPos = tab === "WR/TE";
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th className="usage-name">Player</th>
            {showPos ? <th className="usage-pos">Pos</th> : null}
            <th>Snaps</th>
            <th>Snap%</th>
            {tab === "QB" ? (
              <>
                <th>Comp</th>
                <th>Att</th>
                <th>Pass yds</th>
                <th>TD</th>
                <th>INT</th>
                <th>Rush yds</th>
              </>
            ) : null}
            {tab === "RB" ? (
              <>
                <th>Carries</th>
                <th>Rush%</th>
                <th>Rush yds</th>
                <th>Targets</th>
                <th>Rec</th>
                <th>Rec yds</th>
              </>
            ) : null}
            {tab === "WR/TE" ? (
              <>
                <th>Targets</th>
                <th>Rec</th>
                <th>Yards</th>
                <th>Target%</th>
                <th>Air%</th>
              </>
            ) : null}
            <th className="usage-fpts">
              FPts{" "}
              <span className="usage-fpts-format">({scoringColumn(scoring)})</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.gsis_id}>
              <td className="usage-name">{r.player_name}</td>
              {showPos ? <td className="usage-pos">{r.position}</td> : null}
              <td>{countOrDash(r.offense_snaps)}</td>
              <td>{fmt(r.snap_pct, 0)}</td>
              {tab === "QB" ? (
                <>
                  <td>{countOrDash(r.completions)}</td>
                  <td>{countOrDash(r.pass_attempts)}</td>
                  <td>{countOrDash(r.passing_yards)}</td>
                  <td>{countOrDash(r.passing_tds)}</td>
                  <td>{countOrZero(r.interceptions)}</td>
                  <td>{countOrDash(r.rushing_yards)}</td>
                </>
              ) : null}
              {tab === "RB" ? (
                <>
                  <td>{countOrDash(r.carries)}</td>
                  <td>{fmt(r.rb_rush_share ?? r.rush_share, 0)}</td>
                  <td>{countOrZero(r.rushing_yards)}</td>
                  <td>{countOrDash(r.targets)}</td>
                  <td>{countOrDash(r.receptions)}</td>
                  <td>{countOrZero(r.receiving_yards)}</td>
                </>
              ) : null}
              {tab === "WR/TE" ? (
                <>
                  <td>{countOrDash(r.targets)}</td>
                  <td>{countOrDash(r.receptions)}</td>
                  <td>{countOrDash(r.receiving_yards)}</td>
                  <td>{fmt(r.target_share, 0)}</td>
                  <td>{fmt(r.air_yards_share, 0)}</td>
                </>
              ) : null}
              <td>{fmt(fantasyPoints(r, scoring))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
