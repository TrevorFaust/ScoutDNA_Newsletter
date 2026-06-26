"""Poll team podcast RSS feeds; optional audio transcript via Whisper."""

from __future__ import annotations

import csv
import hashlib
import os
import re
import tempfile
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

import feedparser
import httpx

from ..config import ROOT
from ..football_filter import filter_to_football, looks_non_nfl_title
from ..time_window import issue_date_for_content_date, published_in_issue_window

REGISTRY = ROOT / "data" / "podcasts_registry.csv"
URL_RE = re.compile(r"^https?://", re.I)


def load_podcast_feeds(*, team_slug: str | None = None) -> list[dict]:
    if not REGISTRY.is_file():
        return []
    rows: list[dict] = []
    with REGISTRY.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            url = (row.get("rss_url") or "").strip()
            if not url or not URL_RE.match(url):
                continue
            slug = (row.get("team_slug") or "").strip()
            if team_slug and slug != team_slug:
                continue
            rows.append(
                {
                    "team_slug": slug,
                    "podcast_name": (row.get("podcast_name") or "Podcast").strip(),
                    "rss_url": url,
                    "category": row.get("category") or "independent",
                }
            )
    return rows


def _parse_published(entry: dict) -> str | None:
    for key in ("published_parsed", "updated_parsed"):
        parsed = entry.get(key)
        if parsed:
            return datetime(*parsed[:6]).isoformat()
    for key in ("published", "updated"):
        raw = entry.get(key)
        if raw:
            try:
                return parsedate_to_datetime(raw).isoformat()
            except (TypeError, ValueError, OverflowError):
                pass
    return None


def _episode_body(
    entry: dict,
    *,
    team_slug: str,
    podcast_name: str,
    transcribe: bool,
    whisper_model: str,
) -> tuple[str, str]:
    title = (entry.get("title") or "").strip()
    summary = (entry.get("summary") or entry.get("description") or "")[:8000]
    # strip basic HTML
    summary = re.sub(r"<[^>]+>", " ", summary)
    summary = re.sub(r"\s+", " ", summary).strip()

    enclosure = None
    for enc in entry.get("enclosures") or []:
        if enc.get("type", "").startswith("audio") or enc.get("href", "").endswith(
            (".mp3", ".m4a", ".wav")
        ):
            enclosure = enc.get("href")
            break
    if not enclosure:
        for link in entry.get("links") or []:
            if link.get("type", "").startswith("audio"):
                enclosure = link.get("href")
                break

    method = "rss_description"
    body = f"{title}\n\n{summary}".strip()

    if transcribe and enclosure and os.getenv("PODCAST_TRANSCRIBE", "").lower() in (
        "1",
        "true",
        "yes",
    ):
        try:
            from .youtube import transcribe_whisper

            with tempfile.TemporaryDirectory() as tmp:
                audio_path = Path(tmp) / "episode.mp3"
                with httpx.Client(follow_redirects=True, timeout=120) as client:
                    r = client.get(enclosure)
                    r.raise_for_status()
                    audio_path.write_bytes(r.content)
                transcript = transcribe_whisper(audio_path, whisper_model)
                if len(transcript) > 200:
                    body = f"{title}\n\n{transcript}"
                    method = "whisper"
        except Exception:
            pass

    team_label = team_slug.replace("-", " ").title()
    body = filter_to_football(body, team_name=team_label)
    return body, method


def collect_podcasts_for_date(
    content_date: date,
    *,
    team_slug: str | None = None,
    max_episodes_per_feed: int | None = None,
    whisper_model: str | None = None,
) -> list[dict]:
    max_ep = max_episodes_per_feed or int(os.getenv("PODCAST_MAX_EPISODES_PER_FEED", "2"))
    model = whisper_model or os.getenv("WHISPER_MODEL", "base")
    issue_date = issue_date_for_content_date(content_date)
    transcribe = os.getenv("PODCAST_TRANSCRIBE", "false").lower() in ("1", "true", "yes")

    items: list[dict] = []
    feeds = load_podcast_feeds(team_slug=team_slug)
    scope = f"team={team_slug}" if team_slug else "all teams"
    print(f"Podcast scope: {scope}, {len(feeds)} feeds, max {max_ep} episode(s) per feed")
    for feed in feeds:
        try:
            parsed = feedparser.parse(feed["rss_url"])
        except Exception as e:
            print(f"  RSS fail {feed['podcast_name']}: {e}")
            continue
        if getattr(parsed, "bozo", False) and not parsed.entries:
            print(f"  RSS parse error {feed['podcast_name']}")
            continue

        count = 0
        for entry in parsed.entries[:30]:
            if count >= max_ep:
                break
            published = _parse_published(entry)
            if published and not published_in_issue_window(published, issue_date):
                continue
            if not published:
                continue

            link = entry.get("link") or entry.get("id") or ""
            title = (entry.get("title") or "").strip()
            if not title:
                continue
            if looks_non_nfl_title(title):
                continue
            if not link:
                link = f"{feed['rss_url']}#{entry.get('id', title)}"

            body, method = _episode_body(
                entry,
                team_slug=feed["team_slug"],
                podcast_name=feed["podcast_name"],
                transcribe=transcribe,
                whisper_model=model,
            )
            if len(body) < 60:
                continue

            url_hash = hashlib.sha256(link.encode()).hexdigest()
            items.append(
                {
                    "external_id": entry.get("id", link),
                    "url": link,
                    "url_hash": url_hash,
                    "title": f"{feed['podcast_name']}: {title}",
                    "body": body,
                    "author": feed["podcast_name"],
                    "published_at": published,
                    "content_date": content_date.isoformat(),
                    "source_type": "podcast",
                    "source_tier": 2,
                    "flair": method,
                    "engagement_score": 0,
                    "team_slugs": [feed["team_slug"]],
                    "tags": ["podcast", method],
                    "metadata": {
                        "source_label": feed["podcast_name"],
                        "rss_url": feed["rss_url"],
                        "transcript_method": method,
                        "needs_review": method == "rss_description",
                    },
                }
            )
            count += 1
            print(f"  ok [{method}] {feed['podcast_name'][:40]} — {title[:50]}")

    return items
