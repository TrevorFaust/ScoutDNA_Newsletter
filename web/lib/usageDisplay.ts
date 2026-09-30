import type { PlayerWeekUsage } from "@/lib/playerUsage";

export type PosTab = "QB" | "RB" | "WR" | "TE";

export const POS_TABS: PosTab[] = ["QB", "RB", "WR", "TE"];

export type Scoring = "ppr" | "half" | "std";

export const SCORING_OPTIONS: { value: Scoring; label: string; column: string }[] = [
  { value: "ppr", label: "PPR", column: "PPR" },
  { value: "half", label: "Half PPR", column: "½ PPR" },
  { value: "std", label: "Standard", column: "Std" },
];

export function parseScoring(value: string | undefined): Scoring {
  return SCORING_OPTIONS.some((o) => o.value === value) ? (value as Scoring) : "ppr";
}

export function scoringColumn(scoring: Scoring) {
  return SCORING_OPTIONS.find((o) => o.value === scoring)?.column ?? "PPR";
}

/** nflverse PPR already counts 1 point per catch, so the other formats subtract receptions. */
export function fantasyPoints(row: PlayerWeekUsage, scoring: Scoring): number | null {
  const ppr = row.fantasy_points_ppr;
  if (ppr == null || Number.isNaN(Number(ppr))) return null;
  const rec = Number(row.receptions) || 0;
  if (scoring === "half") return Number(ppr) - rec * 0.5;
  if (scoring === "std") return Number(ppr) - rec;
  return Number(ppr);
}

export function fmt(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

export function countOrDash(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return String(n);
}

export function countOrZero(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return String(n);
}

function snapPct(row: PlayerWeekUsage) {
  return Number(row.snap_pct) || 0;
}

function loggedSnaps(row: PlayerWeekUsage) {
  return (Number(row.offense_snaps) || 0) > 0 || snapPct(row) > 0;
}

function sortUsageRows(rows: PlayerWeekUsage[], tab: PosTab) {
  return rows.toSorted((a, b) => {
    if (tab === "QB") {
      const att = (b.pass_attempts ?? 0) - (a.pass_attempts ?? 0);
      if (att !== 0) return att;
    }
    const snap = snapPct(b) - snapPct(a);
    if (snap !== 0) return snap;
    return (b.fantasy_points_ppr ?? 0) - (a.fantasy_points_ppr ?? 0);
  });
}

/** WRs: keep 4–6 who logged snaps. Drop anyone under 5% unless needed to hit 4. */
function wrSnapSlice(rows: PlayerWeekUsage[]) {
  const withSnaps = rows.filter(loggedSnaps);
  if (withSnaps.length === 0) return rows.slice(0, 4);

  const MIN = 4;
  const MAX = 6;
  const FLOOR = 5;
  const above = withSnaps.filter((r) => snapPct(r) >= FLOOR);
  if (above.length >= MIN) return above.slice(0, MAX);

  const rest = withSnaps.filter((r) => snapPct(r) < FLOOR);
  return [...above, ...rest].slice(0, Math.min(MIN, withSnaps.length));
}

/** Special-teams-only lines (0 offensive snaps, no touches) show up in nflverse with all zeros. */
function hasOffensiveInvolvement(row: PlayerWeekUsage) {
  if (loggedSnaps(row)) return true;
  return (
    (row.carries ?? 0) > 0 ||
    (row.targets ?? 0) > 0 ||
    (row.pass_attempts ?? 0) > 0 ||
    (Number(row.fantasy_points_ppr) || 0) !== 0
  );
}

export function rowsForTab(rows: PlayerWeekUsage[], tab: PosTab): PlayerWeekUsage[] {
  const filtered = rows.filter((r) => {
    if (!hasOffensiveInvolvement(r)) return false;
    const pos = (r.position || "").toUpperCase();
    if (tab === "RB") return pos === "RB" || pos === "FB";
    return pos === tab;
  });
  const sorted = sortUsageRows(filtered, tab);
  if (tab === "WR") return wrSnapSlice(sorted);
  return sorted;
}
