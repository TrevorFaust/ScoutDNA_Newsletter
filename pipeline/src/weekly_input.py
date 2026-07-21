"""Build weekly compose input directly from a week of raw collected items.

There is no daily LLM compose step anymore (it only runs on demand). The weekly
edition clusters the full Mon-Sun window of raw items itself — the same
fuzzy-title clustering the old daily job used per-day, just applied across the
whole week — and ranks stories by day_count (how many distinct days a story
was reported) so recurring/prominent beats lead the recap.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from .dedupe import cluster_items
from .league_feed import cluster_league_feed, extract_league_feed_items
from .storage import fetch_raw_items_for_range
from .teams import Team
from .weekly_window import content_day_label, content_dates_for_week

MAX_TEAM_CLUSTERS = 18
MAX_LEAGUE_CLUSTERS = 14


def _day_labels(content_dates: list[str]) -> list[str]:
    labels: list[str] = []
    for iso in content_dates:
        try:
            labels.append(content_day_label(date.fromisoformat(iso)))
        except ValueError:
            continue
    return labels


def _normalize(raw: list[dict], slug_to_id: dict[str, str]) -> list[dict]:
    id_to_slug = {v: k for k, v in slug_to_id.items()}
    normalized = []
    for row in raw:
        slugs = [id_to_slug[tid] for tid in row.get("team_ids", []) if tid in id_to_slug]
        normalized.append({**row, "team_slugs": slugs})
    return normalized


def build_team_weekly_input(
    team: Team,
    weekly_issue_date: date,
    teams: list[Team],
    slug_to_id: dict[str, str],
) -> dict[str, Any]:
    content_start, content_end = content_dates_for_week(weekly_issue_date)
    raw = fetch_raw_items_for_range(content_start, content_end)
    normalized = [
        row for row in _normalize(raw, slug_to_id) if team.slug in row["team_slugs"]
    ]
    clusters = [c for c in cluster_items(normalized, teams) if c["team_slug"] == team.slug]
    clusters.sort(
        key=lambda c: (-len(c.get("content_dates") or []), -c.get("source_count", 1))
    )

    topic_clusters = []
    for c in clusters[:MAX_TEAM_CLUSTERS]:
        content_dates = c.get("content_dates") or []
        topic_clusters.append(
            {
                "topic_label": (c.get("canonical_title") or "")[:140],
                "summary_seed": (c.get("summary_seed") or "")[:400],
                "day_count": len(content_dates) or 1,
                "day_labels": _day_labels(content_dates),
                "source_urls": (c.get("source_urls") or [])[:6],
                "source_count": c.get("source_count", 1),
                "tags": c.get("tags", []),
                "needs_review": c.get("needs_review", False),
                "raw_titles": c.get("raw_titles", []),
            }
        )

    return {
        "team_slug": team.slug,
        "week_label": f"{content_start.isoformat()} to {content_end.isoformat()}",
        "topic_clusters": topic_clusters,
    }


def build_league_weekly_input(
    weekly_issue_date: date,
    slug_to_id: dict[str, str],
) -> dict[str, Any]:
    content_start, content_end = content_dates_for_week(weekly_issue_date)
    raw = fetch_raw_items_for_range(content_start, content_end)
    normalized = _normalize(raw, slug_to_id)
    league_items = extract_league_feed_items(normalized)
    clusters = cluster_league_feed(league_items, limit=200)
    clusters.sort(key=lambda c: -len(c.get("content_dates") or []))

    topic_clusters = []
    for c in clusters[:MAX_LEAGUE_CLUSTERS]:
        content_dates = c.get("content_dates") or []
        topic_clusters.append(
            {
                "topic_label": (c.get("canonical_title") or "")[:140],
                "summary_seed": (c.get("summary_seed") or "")[:400],
                "day_count": len(content_dates) or 1,
                "day_labels": _day_labels(content_dates),
                "source_urls": (c.get("source_urls") or [])[:3],
                "tags": c.get("tags", []),
            }
        )

    return {
        "week_label": weekly_issue_date.isoformat(),
        "topic_clusters": topic_clusters,
    }
