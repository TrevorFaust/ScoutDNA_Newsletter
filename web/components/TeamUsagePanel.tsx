"use client";

import { useMemo, useState } from "react";
import type { PlayerWeekUsage } from "@/lib/playerUsage";

type PosTab = "RB" | "WR" | "TE";

const TABS: PosTab[] = ["RB", "WR", "TE"];

function fmt(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

function rowsForTab(rows: PlayerWeekUsage[], tab: PosTab): PlayerWeekUsage[] {
  const filtered = rows.filter((r) => {
    const pos = (r.position || "").toUpperCase();
    if (tab === "RB") return pos === "RB" || pos === "FB";
    return pos === tab;
  });
  return filtered.toSorted((a, b) => {
    const snap = (b.snap_pct ?? 0) - (a.snap_pct ?? 0);
    if (snap !== 0) return snap;
    return (b.fantasy_points_ppr ?? 0) - (a.fantasy_points_ppr ?? 0);
  });
}

type Props = {
  rows: PlayerWeekUsage[];
  weekLabel?: string;
};

export function TeamUsagePanel({ rows, weekLabel }: Props) {
  const available = useMemo(() => {
    return TABS.filter((tab) => rowsForTab(rows, tab).length > 0);
  }, [rows]);

  const [tab, setTab] = useState<PosTab>(available[0] ?? "RB");
  const active = available.includes(tab) ? tab : available[0];
  const activeRows = active ? rowsForTab(rows, active) : [];

  if (!available.length || !active) return null;

  return (
    <div className="team-usage-panel">
      <div className="team-usage-panel-header">
        <h4 className="team-usage-panel-title">
          Week usage{weekLabel ? ` · ${weekLabel}` : ""}
        </h4>
        <div className="team-usage-tabs" role="tablist" aria-label="Position usage">
          {available.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === active}
              className={
                t === active ? "team-usage-tab team-usage-tab-active" : "team-usage-tab"
              }
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="usage-table-wrap">
        <table className="usage-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Snap%</th>
              {active === "RB" ? (
                <>
                  <th>Carries</th>
                  <th>Rush%</th>
                  <th>Targets</th>
                  <th>Rec</th>
                </>
              ) : (
                <>
                  <th>Targets</th>
                  <th>Target%</th>
                  <th>Air%</th>
                  <th>Rec</th>
                  <th>Yards</th>
                </>
              )}
              <th>PPR</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((r) => (
              <tr key={r.gsis_id}>
                <td>{r.player_name}</td>
                <td>{fmt(r.snap_pct, 0)}</td>
                {active === "RB" ? (
                  <>
                    <td>{r.carries ?? "—"}</td>
                    <td>{fmt(r.rb_rush_share ?? r.rush_share, 0)}</td>
                    <td>{r.targets ?? "—"}</td>
                    <td>{r.receptions ?? "—"}</td>
                  </>
                ) : (
                  <>
                    <td>{r.targets ?? "—"}</td>
                    <td>{fmt(r.target_share, 0)}</td>
                    <td>{fmt(r.air_yards_share, 0)}</td>
                    <td>{r.receptions ?? "—"}</td>
                    <td>{r.receiving_yards ?? "—"}</td>
                  </>
                )}
                <td>{fmt(r.fantasy_points_ppr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
