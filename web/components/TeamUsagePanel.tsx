"use client";

import { useMemo, useState } from "react";
import { MatchupTag } from "@/components/MatchupTag";
import { UsagePosTable } from "@/components/UsagePosTable";
import type { PlayerWeekUsage } from "@/lib/playerUsage";
import type { TeamGame } from "@/lib/teamGames";
import { POS_TABS, rowsForTab, type PosTab } from "@/lib/usageDisplay";

type Props = {
  rows: PlayerWeekUsage[];
  weekLabel?: string;
  matchup?: TeamGame;
};

export function TeamUsagePanel({ rows, weekLabel, matchup }: Props) {
  const available = useMemo(() => {
    return POS_TABS.filter((tab) => rowsForTab(rows, tab).length > 0);
  }, [rows]);

  const initial = available.includes("QB") ? "QB" : available[0] ?? "QB";
  const [tab, setTab] = useState<PosTab>(initial);
  const active = available.includes(tab) ? tab : available[0];
  const activeRows = active ? rowsForTab(rows, active) : [];

  if (!available.length || !active) return null;

  return (
    <div className="team-usage-panel">
      <div className="team-usage-panel-header">
        <div className="usage-team-heading">
          <h4 className="team-usage-panel-title">
            Week usage{weekLabel ? ` · ${weekLabel}` : ""}
          </h4>
          {matchup ? <MatchupTag game={matchup} /> : null}
        </div>
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
      <UsagePosTable rows={activeRows} tab={active} />
    </div>
  );
}
