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

/** Display title: "Week 1 recap" in season, date range in preseason. */
export function recapLabel(weeklyIssueDate: string): string {
  const n = nflWeekNumber(weeklyIssueDate);
  if (n) return `Week ${n} recap`;
  return weekRangeLabel(weeklyIssueDate);
}

export function weeklyEditionLabel(weeklyIssueDate: string): string {
  return nflWeekNumber(weeklyIssueDate) ? recapLabel(weeklyIssueDate) : "Weekly";
}

export function weekRecapSubtitle(weeklyIssueDate: string): string {
  const { weekStart, weekEnd } = weekContentRange(weeklyIssueDate);
  const fmt = ({ y, m, d }: CalendarDate) =>
    `${WEEKDAY_SHORT[utcWeekday(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`)]}, ${MONTH_SHORT[m - 1]} ${d}`;
  const range = `${fmt(weekStart)} through ${fmt(weekEnd)}`;
  const n = nflWeekNumber(weeklyIssueDate);
  if (n) return `Week ${n} recap · ${range}`;
  return `Week in review: ${range}`;
}
