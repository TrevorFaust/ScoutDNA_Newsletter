"""Reddit via public RSS feeds — no API app or OAuth required."""

from __future__ import annotations

import hashlib
import os
import re
import time
from datetime import date, datetime
from email.utils import parsedate_to_datetime

import feedparser
import httpx

from ..reddit_filter import is_relevant_reddit_post
from ..teams import Team
from ..time_window import issue_date_for_content_date, published_in_issue_window

from .reddit import GOOD_FLAIRS, _headers  # noqa: PLC2701 — shared constants


def _parse_entry_time(entry: dict) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        return datetime(*parsed[:6])
    raw = entry.get("published") or entry.get("updated")
    if raw:
        try:
            return parsedate_to_datetime(raw)
        except (TypeError, ValueError, OverflowError):
            pass
    return None


def _flair_from_entry(entry: dict) -> str:
    for tag in entry.get("tags") or []:
        term = (tag.get("term") or "").strip()
        if term and term.lower() not in ("r/", "reddit"):
            return term
    return ""


def _item_from_rss_entry(
    entry: dict,
    *,
    content_date: date,
    team: Team | None,
    source_label: str,
    source_tier: int,
) -> dict | None:
    title = (entry.get("title") or "").strip()
    if not title:
        return None

    flair = _flair_from_entry(entry)
    summary = entry.get("summary") or ""
    body_preview = re.sub(r"<[^>]+>", " ", summary)
    body_preview = re.sub(r"\s+", " ", body_preview).strip()
    if not is_relevant_reddit_post(
        title=title,
        body=body_preview,
        flair=flair,
        is_self=not entry.get("link") or "reddit.com" in (entry.get("link") or ""),
    ):
        return None

    link = (entry.get("link") or "").strip()
    if not link:
        return None
    if not link.startswith("http"):
        link = f"https://www.reddit.com{link}"

    published_dt = _parse_entry_time(entry)
    if not published_dt:
        return None
    published = published_dt.isoformat()
    issue_date = issue_date_for_content_date(content_date)
    if not published_in_issue_window(published, issue_date):
        return None

    body = body_preview[:4000] or None

    engagement = 0
    needs_review = flair.lower() in ("rumor", "speculation")
    if flair and flair.lower() in GOOD_FLAIRS:
        needs_review = needs_review and flair.lower() == "rumor"

    url_hash = hashlib.sha256(link.encode()).hexdigest()
    tags = ["reddit", "reddit_rss"]
    if flair:
        tags.append(flair.lower())

    team_slugs: list[str] = [team.slug] if team else []

    return {
        "external_id": entry.get("id", link),
        "url": link,
        "url_hash": url_hash,
        "title": title,
        "body": body,
        "author": None,
        "published_at": published,
        "content_date": content_date.isoformat(),
        "source_type": "reddit",
        "source_tier": source_tier,
        "flair": flair or None,
        "engagement_score": engagement,
        "team_slugs": team_slugs,
        "tags": tags,
        "metadata": {
            "source_label": source_label,
            "needs_review": needs_review,
            "subreddit": team.reddit if team else "nfl",
            "fetch_method": "rss",
        },
    }


def _fetch_rss(
    client: httpx.Client, subreddit: str, *, limit: int = 25, retries: int = 2
) -> list[dict]:
    url = f"https://www.reddit.com/r/{subreddit}/new.rss?limit={limit}"
    last_err: httpx.HTTPError | None = None
    for attempt in range(retries + 1):
        resp = client.get(url, headers=_headers(), timeout=45, follow_redirects=True)
        if resp.status_code == 429 and attempt < retries:
            wait = 8 * (attempt + 1)
            print(f"  RSS rate limit r/{subreddit} — waiting {wait}s")
            time.sleep(wait)
            continue
        try:
            resp.raise_for_status()
        except httpx.HTTPError as e:
            last_err = e
            break
        parsed = feedparser.parse(resp.content)
        return list(parsed.entries or [])[:limit]
    if last_err:
        raise last_err
    return []


def collect_reddit_rss(
    teams: list[Team],
    content_date: date,
    *,
    team_limit: int | None = None,
    nfl_limit: int | None = None,
    delay_seconds: float | None = None,
) -> list[dict]:
    """
    Poll r/nfl + each team sub via RSS (same coverage as the JSON collector).
    Uses only REDDIT_USER_AGENT in .env — no client id/secret.
    """
    team_limit = team_limit or int(os.getenv("REDDIT_RSS_TEAM_LIMIT", "50"))
    nfl_limit = nfl_limit or int(os.getenv("REDDIT_RSS_NFL_LIMIT", "50"))
    if delay_seconds is None:
        delay_seconds = float(os.getenv("REDDIT_RSS_DELAY_SEC", "0.6"))
    items: list[dict] = []
    skip_nfl = os.getenv("REDDIT_RSS_SKIP_NFL", "").lower() in ("1", "true", "yes")
    with httpx.Client() as client:
        if not skip_nfl and nfl_limit > 0:
            try:
                for entry in _fetch_rss(client, "nfl", limit=nfl_limit):
                    mapped = _item_from_rss_entry(
                        entry,
                        content_date=content_date,
                        team=None,
                        source_label="r/nfl",
                        source_tier=1,
                    )
                    if mapped:
                        items.append(mapped)
            except httpx.HTTPError as e:
                print(f"  RSS skip r/nfl: {e}")
            time.sleep(delay_seconds)

        for team in teams:
            try:
                entries = _fetch_rss(client, team.reddit, limit=team_limit)
            except httpx.HTTPError as e:
                print(f"  RSS skip r/{team.reddit}: {e}")
                time.sleep(delay_seconds)
                continue
            for entry in entries:
                mapped = _item_from_rss_entry(
                    entry,
                    content_date=content_date,
                    team=team,
                    source_label=f"r/{team.reddit}",
                    source_tier=2,
                )
                if mapped:
                    items.append(mapped)
            time.sleep(delay_seconds)

    return items
