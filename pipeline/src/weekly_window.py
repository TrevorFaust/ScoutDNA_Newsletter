"""Date helpers for Tuesday weekly issues (prior Tue–Mon PT content)."""
from datetime import date, timedelta

# First Tuesday recap of the 2026 regular season (covers TNF through MNF of Week 1).
REG_WEEK1_TUESDAY = date(2026, 9, 15)


def is_monday(d: date) -> bool:
    return d.weekday() == 0


def is_weekly_issue_day(d: date) -> bool:
    """Regular-season week-in-review is dated Tuesday so Monday Night Football is in."""
    return d.weekday() == 1


def content_dates_for_week(weekly_issue_date: date) -> tuple[date, date]:
    """Seven calendar days ending the day before the weekly issue.

    Tuesday issue → prior Tuesday through Monday (TNF through MNF).
    Legacy Monday issues → prior Monday through Sunday.
    """
    week_end = weekly_issue_date - timedelta(days=1)
    week_start = week_end - timedelta(days=6)
    return week_start, week_end


def daily_issue_dates_for_week(weekly_issue_date: date) -> list[date]:
    """Daily issue_date values whose 24h windows cover the weekly content range."""
    week_start, _week_end = content_dates_for_week(weekly_issue_date)
    return [week_start + timedelta(days=i + 1) for i in range(7)]


def nfl_week_number(weekly_issue_date: date) -> int | None:
    """NFL regular-season week for a Tuesday recap. None for preseason issues."""
    if weekly_issue_date < REG_WEEK1_TUESDAY:
        return None
    return 1 + (weekly_issue_date - REG_WEEK1_TUESDAY).days // 7


def recap_label(weekly_issue_date: date) -> str:
    """Display title: 'Week 1 recap' in season, date range in preseason."""
    n = nfl_week_number(weekly_issue_date)
    if n:
        return f"Week {n} recap"
    return week_range_label(weekly_issue_date)


def _day_ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def week_range_label(weekly_issue_date: date) -> str:
    """Human date window, e.g. 'September 8th through 14th, 2026'."""
    week_start, week_end = content_dates_for_week(weekly_issue_date)
    if week_start.month == week_end.month and week_start.year == week_end.year:
        return (
            f"{week_start.strftime('%B')} {_day_ordinal(week_start.day)} through "
            f"{_day_ordinal(week_end.day)}, {week_end.year}"
        )
    return (
        f"{week_start.strftime('%B')} {_day_ordinal(week_start.day)} through "
        f"{week_end.strftime('%B')} {_day_ordinal(week_end.day)}, {week_end.year}"
    )


def week_label(weekly_issue_date: date) -> str:
    """Prompt/UI label: Week N recap when in season, else the date window."""
    return recap_label(weekly_issue_date)


def day_label_for_issue(issue_date: date) -> str:
    """Human label for the calendar day covered by a daily issue."""
    content = issue_date - timedelta(days=1)
    return f"{content.strftime('%a %b')} {content.day}"


def content_day_label(content_date: date) -> str:
    """Human label for a raw item's content_date (already the calendar day)."""
    return f"{content_date.strftime('%a %b')} {content_date.day}"
