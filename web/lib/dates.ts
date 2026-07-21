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

/** Monday weekly issue → prior Mon–Sun content window (matches pipeline). */
export function weekContentRange(weeklyIssueDate: string) {
  const sunday = addCalendarDays(weeklyIssueDate, -1);
  const weekStart = addCalendarDays(weeklyIssueDate, -7);
  return { weekStart, sunday };
}

export function weekRangeLabel(weeklyIssueDate: string): string {
  const { weekStart, sunday } = weekContentRange(weeklyIssueDate);

  if (weekStart.m === sunday.m && weekStart.y === sunday.y) {
    return `${MONTH_LONG[weekStart.m - 1]} ${weekStart.d}–${sunday.d}, ${sunday.y}`;
  }

  return `${MONTH_SHORT[weekStart.m - 1]} ${weekStart.d}–${MONTH_SHORT[sunday.m - 1]} ${sunday.d}, ${sunday.y}`;
}

export function weekRecapSubtitle(weeklyIssueDate: string): string {
  const { weekStart, sunday } = weekContentRange(weeklyIssueDate);
  const fmt = ({ y, m, d }: CalendarDate) =>
    `${WEEKDAY_SHORT[utcWeekday(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`)]}, ${MONTH_SHORT[m - 1]} ${d}`;
  return `Week in review: ${fmt(weekStart)} through ${fmt(sunday)}`;
}
