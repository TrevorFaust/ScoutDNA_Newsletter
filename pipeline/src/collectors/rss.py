import hashlib
from datetime import date, datetime

import feedparser

from ..teams import Team
from ..time_window import issue_date_for_content_date, published_in_issue_window

DEFAULT_FEEDS = [
    ("ESPN NFL", "https://www.espn.com/espn/rss/nfl/news", 1, None),
]


def _match_teams(text: str, teams: list[Team]) -> list[str]:
    lower = text.lower()
    matched: list[str] = []
    for team in teams:
        if any(kw in lower for kw in team.keywords if len(kw) > 3):
            matched.append(team.slug)
    return matched


def collect_rss(
    teams: list[Team],
    content_date: date,
    feeds: list[tuple[str, str, int, str | None]] | None = None,
) -> list[dict]:
    items: list[dict] = []
    for label, url, tier, forced_slug in feeds or DEFAULT_FEEDS:
        parsed = feedparser.parse(url)
        for entry in parsed.entries[:40]:
            title = (entry.get("title") or "").strip()
            link = entry.get("link") or ""
            if not title or not link:
                continue
            summary = entry.get("summary", "")[:4000]
            published = None
            if entry.get("published_parsed"):
                published = datetime(*entry.published_parsed[:6]).isoformat()
            issue_date = issue_date_for_content_date(content_date)
            if published and not published_in_issue_window(published, issue_date):
                continue
            if not published:
                continue
            text = f"{title} {summary}"
            slugs = [forced_slug] if forced_slug else _match_teams(text, teams)
            url_hash = hashlib.sha256(link.encode()).hexdigest()
            items.append(
                {
                    "external_id": entry.get("id", link),
                    "url": link,
                    "url_hash": url_hash,
                    "title": title,
                    "body": summary or None,
                    "author": entry.get("author"),
                    "published_at": published,
                    "content_date": content_date.isoformat(),
                    "source_type": "rss",
                    "source_tier": tier,
                    "flair": None,
                    "engagement_score": 0,
                    "team_slugs": slugs,
                    "tags": ["rss", label.lower().replace(" ", "-")],
                    "metadata": {"source_label": label, "needs_review": False},
                }
            )
    return items
