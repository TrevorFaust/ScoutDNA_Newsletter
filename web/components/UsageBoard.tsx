"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import { UsagePosTable } from "@/components/UsagePosTable";
import type { PlayerWeekUsage } from "@/lib/playerUsage";
import { getTeams } from "@/lib/teams";
import {
  POS_TABS,
  rowsForTab,
  scoringColumn,
  type PosTab,
  type Scoring,
} from "@/lib/usageDisplay";

type Group = { team: string; items: PlayerWeekUsage[] };

type Props = {
  weekHeading: string;
  weekNote?: string;
  weekGroups: Group[];
  stdHeading?: string;
  stdGroups?: Group[];
  scoring: Scoring;
};

const TEAM_BY_ABBREV = new Map(getTeams().map((t) => [t.abbrev.toUpperCase(), t]));

/** nflverse still tags the Rams as LA. */
function siteAbbrev(team: string) {
  return team === "LA" ? "LAR" : team;
}

const SCORING_NOTES: Record<Scoring, string> = {
  ppr: "Fantasy points in full PPR: a point per catch on top of yards and touchdowns.",
  half: "Fantasy points in half PPR: half a point per catch on top of yards and touchdowns.",
  std: "Fantasy points in standard scoring: yards and touchdowns only, no points for catches.",
};

function metricsFor(scoring: Scoring) {
  return [
    {
      id: "snaps",
      label: "Snaps",
      text: "Offensive snaps played. All weeks adds them up. Blank until snap counts are published.",
    },
    {
      id: "snap-pct",
      label: "Snap%",
      text: "Share of the team's offensive snaps. All weeks uses combined totals, so one big game can't pass for a season rate.",
    },
    {
      id: "comp-att",
      label: "Comp / Att",
      text: "Quarterback completions and pass attempts from the box score.",
    },
    {
      id: "pass",
      label: "Pass yds · TD · INT",
      text: "Passing yards, touchdowns, and interceptions for the week or the season total.",
    },
    {
      id: "rush-share",
      label: "Rush%",
      text: "A running back's share of the team's carries.",
    },
    {
      id: "target-share",
      label: "Target%",
      text: "Share of the team's targets that went to this player.",
    },
    {
      id: "air-share",
      label: "Air%",
      text: "Share of the team's air yards, meaning how far downfield his targets traveled. Screens behind the line can push it negative.",
    },
    {
      id: "fpts",
      label: `FPts (${scoringColumn(scoring)})`,
      text: SCORING_NOTES[scoring],
    },
  ];
}

function MetricKey({ scoring }: { scoring: Scoring }) {
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const detailId = useId();
  const metrics = metricsFor(scoring);
  const shown = metrics.find((m) => m.id === (hovered ?? pinned));
  const isOpen = Boolean(shown);

  useEffect(() => {
    if (!isOpen) return;
    const close = () => {
      setPinned(null);
      setHovered(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.(".metric-chip")) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="metric-key">
      <ul className="metric-key-list">
        {metrics.map((metric) => (
          <li key={metric.id}>
            <button
              type="button"
              className={
                metric.id === pinned ? "metric-chip is-pinned" : "metric-chip"
              }
              aria-pressed={metric.id === pinned}
              aria-controls={detailId}
              onMouseEnter={() => setHovered(metric.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(metric.id)}
              onBlur={() => setHovered(null)}
              onClick={() => setPinned((cur) => (cur === metric.id ? null : metric.id))}
            >
              {metric.label}
            </button>
          </li>
        ))}
      </ul>
      <p
        id={detailId}
        className={shown ? "metric-detail is-active" : "metric-detail"}
        aria-live="polite"
      >
        {shown ? (
          <span>
            <strong>{shown.label}.</strong> {shown.text}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function TeamTitle({ team }: { team: string }) {
  const abbrev = siteAbbrev(team);
  const info = TEAM_BY_ABBREV.get(abbrev);
  return (
    <h3 className="camp-team-group-title usage-team-title">
      <TeamLogo abbrev={abbrev} size={28} />
      <span className="usage-team-abbrev">{abbrev}</span>
      {info ? <span className="usage-team-name">{info.name}</span> : null}
    </h3>
  );
}

function TeamUsageBox({ team, items, scoring }: Group & { scoring: Scoring }) {
  const available = useMemo(
    () => POS_TABS.filter((tab) => rowsForTab(items, tab).length > 0),
    [items]
  );
  const initial = available.includes("QB") ? "QB" : available[0] ?? "QB";
  const [tab, setTab] = useState<PosTab>(initial);
  const active = available.includes(tab) ? tab : initial;
  const rows = active ? rowsForTab(items, active) : [];

  if (!available.length || !active) return null;

  return (
    <section className="camp-team-group">
      <div className="team-usage-panel-header">
        <TeamTitle team={team} />
        <div className="team-usage-tabs" role="tablist" aria-label={`${team} position usage`}>
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
      <UsagePosTable rows={rows} tab={active} scoring={scoring} />
    </section>
  );
}

function TeamGroups({ groups, scoring }: { groups: Group[]; scoring: Scoring }) {
  const visible = groups
    .filter((g) => POS_TABS.some((tab) => rowsForTab(g.items, tab).length > 0))
    .toSorted((a, b) => siteAbbrev(a.team).localeCompare(siteAbbrev(b.team)));

  if (visible.length === 0) {
    return <p className="camp-admin-muted">No skill rows for this slice.</p>;
  }

  return (
    <div className="camp-team-groups">
      {visible.map((g) => (
        <TeamUsageBox key={g.team} team={g.team} items={g.items} scoring={scoring} />
      ))}
    </div>
  );
}

export function UsageBoard({
  weekHeading,
  weekNote,
  weekGroups,
  stdHeading,
  stdGroups = [],
  scoring,
}: Props) {
  return (
    <>
      {weekGroups.length > 0 ? (
        <section className="camp-admin-card">
          <h2 className="usage-board-heading">{weekHeading}</h2>
          {weekNote ? <p className="camp-admin-muted usage-board-note">{weekNote}</p> : null}
          <MetricKey scoring={scoring} />
          <TeamGroups groups={weekGroups} scoring={scoring} />
        </section>
      ) : null}

      {stdGroups.length > 0 && stdHeading ? (
        <section className="camp-admin-card">
          <h2 className="usage-board-heading">{stdHeading}</h2>
          <p className="camp-admin-muted usage-board-note">
            Totals for counting stats. Snap%, rush share, Target%, and Air% are
            true season shares (player total ÷ team season total), not averages
            of weekly percentages.
          </p>
          <TeamGroups groups={stdGroups} scoring={scoring} />
        </section>
      ) : null}
    </>
  );
}
