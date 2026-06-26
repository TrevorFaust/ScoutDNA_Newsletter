from datetime import date, datetime, timedelta, timezone

from .config import TZ, content_window_for_issue


def issue_date_for_content_date(content_date: date) -> date:
    return content_date + timedelta(days=1)


def parse_published_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ)


def published_in_issue_window(published_at: str | None, issue_date: date) -> bool:
    """True if published within prior calendar day (PT) for this issue_date."""
    if not published_at:
        return False
    parsed = parse_published_at(published_at)
    if not parsed:
        return False
    start, end = content_window_for_issue(issue_date)
    return start <= parsed < end


def filter_raw_by_issue_window(items: list[dict], issue_date: date) -> list[dict]:
    return [i for i in items if published_in_issue_window(i.get("published_at"), issue_date)]
