const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type CalendarDate = { y: number; m: number; d: number };

/** Parse YYYY-MM-DD without timezone drift. */
export function parseCalendarDate(iso: string): CalendarDate {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function addCalendarDays(iso: string, delta: number): CalendarDate {
  const { y, m, d } = parseCalendarDate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}

function utcWeekday(iso: string): number {
  const { y, m, d } = parseCalendarDate(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Format a calendar date for display (timezone-stable for SSR + client). */
export function formatIssueDate(iso: string): string {
  const { y, m, d } = parseCalendarDate(iso);
  const weekday = WEEKDAY_SHORT[utcWeekday(iso)];
  return `${weekday}, ${MONTH_SHORT[m - 1]} ${d}, ${y}`;
}

/** Weekly issue → 7 calendar days ending the day before (Tue issue = Tue–Mon). */
export function weekContentRange(weeklyIssueDate: string) {
  const weekEnd = addCalendarDays(weeklyIssueDate, -1);
  const weekStart = addCalendarDays(weeklyIssueDate, -7);
  return { weekStart, weekEnd };
}

function dayOrdinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** e.g. "August 3rd through 9th, 2026" */
export function weekRangeLabel(weeklyIssueDate: string): string {
  const { weekStart, weekEnd } = weekContentRange(weeklyIssueDate);

  if (weekStart.m === weekEnd.m && weekStart.y === weekEnd.y) {
    return `${MONTH_LONG[weekStart.m - 1]} ${dayOrdinal(weekStart.d)} through ${dayOrdinal(weekEnd.d)}, ${weekEnd.y}`;
  }

  return `${MONTH_LONG[weekStart.m - 1]} ${dayOrdinal(weekStart.d)} through ${MONTH_LONG[weekEnd.m - 1]} ${dayOrdinal(weekEnd.d)}, ${weekEnd.y}`;
}

const REG_WEEK1_TUESDAY = "2026-09-15";

function daysBetween(fromIso: string, toIso: string): number {
  const a = parseCalendarDate(fromIso);
  const b = parseCalendarDate(toIso);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.floor(ms / 86_400_000);
}

/** NFL regular-season week for a Tuesday recap. Null for preseason issues. */
export function nflWeekNumber(weeklyIssueDate: string): number | null {
  const delta = daysBetween(REG_WEEK1_TUESDAY, weeklyIssueDate);
  if (delta < 0) return null;
  return 1 + Math.floor(delta / 7);
}

/**
 * Weekly issues published before Week 1, oldest first. Numbered by position rather
 * than by date so a skipped week never leaves a gap: the last PRESEASON_WEEKS are
 * preseason, everything earlier is training camp counting up from Week 1.
 */
const PRE_WEEK1_ISSUE_DATES = [
  "2026-06-08",
  "2026-06-15",
  "2026-06-22",
  "2026-06-29",
  "2026-07-07",
  "2026-07-20",
  "2026-07-27",
  "2026-08-03",
  "2026-08-10",
  "2026-08-17",
  "2026-08-24",
  "2026-08-31",
  "2026-09-07",
  "2026-09-14",
] as const;
const PRESEASON_WEEKS = 3;

export type SeasonPhase = "regular" | "preseason" | "camp";

export function seasonWeek(
  weeklyIssueDate: string
): { phase: SeasonPhase; week: number } | null {
  const n = nflWeekNumber(weeklyIssueDate);
  if (n) return { phase: "regular", week: n };
  const idx = PRE_WEEK1_ISSUE_DATES.indexOf(
    weeklyIssueDate.slice(0, 10) as (typeof PRE_WEEK1_ISSUE_DATES)[number]
  );
  if (idx < 0) return null;
  const campWeeks = PRE_WEEK1_ISSUE_DATES.length - PRESEASON_WEEKS;
  return idx >= campWeeks
    ? { phase: "preseason", week: idx - campWeeks + 1 }
    : { phase: "camp", week: idx + 1 };
}

const PHASE_PREFIX: Record<SeasonPhase, string> = {
  regular: "Week",
  preseason: "Preseason Week",
  camp: "Training Camp Week",
};

/** Display title: "Week 1 Recap", "Preseason Week 3 Recap", "Training Camp Week 11 Recap". */
export function recapLabel(weeklyIssueDate: string): string {
  const sw = seasonWeek(weeklyIssueDate);
  if (sw) return `${PHASE_PREFIX[sw.phase]} ${sw.week} Recap`;
  return weekRangeLabel(weeklyIssueDate);
}

/** Short index-tab label: "Week 3", "Preseason Week 2", "Camp Week 11", else "Sep 7–13". */
export function weekTabLabel(weeklyIssueDate: string): string {
  const sw = seasonWeek(weeklyIssueDate);
  if (sw) {
    if (sw.phase === "regular") return `Week ${sw.week}`;
    if (sw.phase === "preseason") return `Preseason Week ${sw.week}`;
    return `Camp Week ${sw.week}`;
  }
  const { weekStart, weekEnd } = weekContentRange(weeklyIssueDate);
  const start = `${MONTH_SHORT[weekStart.m - 1]} ${weekStart.d}`;
  const end =
    weekStart.m === weekEnd.m
      ? String(weekEnd.d)
      : `${MONTH_SHORT[weekEnd.m - 1]} ${weekEnd.d}`;
  return `${start}–${end}`;
}

export function weeklyEditionLabel(weeklyIssueDate: string): string {
  return seasonWeek(weeklyIssueDate) ? recapLabel(weeklyIssueDate) : "Weekly";
}

export function weekRecapSubtitle(weeklyIssueDate: string): string {
  const { weekStart, weekEnd } = weekContentRange(weeklyIssueDate);
  const fmt = ({ y, m, d }: CalendarDate) =>
    `${WEEKDAY_SHORT[utcWeekday(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`)]}, ${MONTH_SHORT[m - 1]} ${d}`;
  const range = `${fmt(weekStart)} through ${fmt(weekEnd)}`;
  if (seasonWeek(weeklyIssueDate)) return `${recapLabel(weeklyIssueDate)} · ${range}`;
  return `Week in review: ${range}`;
}
