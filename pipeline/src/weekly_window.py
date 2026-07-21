"""Date helpers for Monday weekly issues (prior Mon–Sun PT content)."""
from datetime import date, timedelta


def is_monday(d: date) -> bool:
    return d.weekday() == 0


def content_dates_for_week(weekly_issue_date: date) -> tuple[date, date]:
    """Calendar Mon–Sun whose news is covered by a weekly issue dated on Monday."""
    sunday = weekly_issue_date - timedelta(days=1)
    monday = sunday - timedelta(days=6)
    return monday, sunday


def daily_issue_dates_for_week(weekly_issue_date: date) -> list[date]:
    """Daily issue_date values whose 24h windows cover Mon–Sun content."""
    monday, sunday = content_dates_for_week(weekly_issue_date)
    return [monday + timedelta(days=i + 1) for i in range(7)]


def week_label(weekly_issue_date: date) -> str:
    monday, sunday = content_dates_for_week(weekly_issue_date)
    if monday.month == sunday.month:
        return f"{monday.strftime('%B %d')}–{sunday.day}, {sunday.year}"
    return f"{monday.strftime('%b %d')}–{sunday.strftime('%b %d, %Y')}"


def day_label_for_issue(issue_date: date) -> str:
    """Human label for the calendar day covered by a daily issue."""
    content = issue_date - timedelta(days=1)
    return f"{content.strftime('%a %b')} {content.day}"


def content_day_label(content_date: date) -> str:
    """Human label for a raw item's content_date (already the calendar day)."""
    return f"{content_date.strftime('%a %b')} {content_date.day}"
