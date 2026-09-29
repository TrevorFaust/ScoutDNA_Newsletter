import type { PlayerWeekUsage } from "@/lib/playerUsage";
import { countOrDash, countOrZero, fmt, type PosTab } from "@/lib/usageDisplay";

type Props = {
  rows: PlayerWeekUsage[];
  tab: PosTab;
  showPos?: boolean;
};

export function UsagePosTable({ rows, tab, showPos = false }: Props) {
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>Player</th>
            {showPos ? <th>Pos</th> : null}
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
            {tab === "WR" || tab === "TE" ? (
              <>
                <th>Targets</th>
                <th>Rec</th>
                <th>Yards</th>
                <th>Target%</th>
                <th>Air%</th>
              </>
            ) : null}
            <th>PPR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.gsis_id}>
              <td>{r.player_name}</td>
              {showPos ? <td>{r.position}</td> : null}
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
              {tab === "WR" || tab === "TE" ? (
                <>
                  <td>{countOrDash(r.targets)}</td>
                  <td>{countOrDash(r.receptions)}</td>
                  <td>{countOrDash(r.receiving_yards)}</td>
                  <td>{fmt(r.target_share, 0)}</td>
                  <td>{fmt(r.air_yards_share, 0)}</td>
                </>
              ) : null}
              <td>{fmt(r.fantasy_points_ppr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
