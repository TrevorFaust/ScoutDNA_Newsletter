"""Select and cluster stories intended for the league-wide section only."""

from thefuzz import fuzz


LEAGUE_TOPIC_WORDS = (
    "schedule",
    "rule",
    "rules",
    "combine",
    "draft",
    "ota",
    "otas",
    "minicamp",
    "league",
    "nfl",
    "owners",
    "cba",
    "uniform",
    "jersey",
    "broadcast",
    "sunday ticket",
    "trade deadline",
    "salary cap",
    "free agency",
    "opening day",
)

# National-story signals — allow into league feed even when tagged to one team.
BIG_STORY_WORDS = (
    "scandal",
    "allegation",
    "allegations",
    "investigation",
    "investigating",
    "cheating",
    "lawsuit",
    "arrested",
    "indicted",
    "suspended",
    "commissioner",
    "league office",
    "nfl investigating",
    "fired",
    "resign",
    "resigned",
)


def extract_league_feed_items(items: list[dict]) -> list[dict]:
    """Raw items suitable for league-wide block (not team beat posts)."""
    selected: list[dict] = []
    for item in items:
        meta = item.get("metadata") or {}
        label = (meta.get("source_label") or "").lower()
        slugs = item.get("team_slugs") or []
        text = f"{item.get('title', '')} {item.get('body', '')}".lower()

        if any(w in text for w in BIG_STORY_WORDS):
            selected.append(item)
            continue

        if label == "r/nfl":
            # r/nfl team highlight reels still tag one team — skip obvious single-team camp clips
            if len(slugs) == 1 and not any(w in text for w in LEAGUE_TOPIC_WORDS):
                if any(w in text for w in ("highlight", "hype", "viral", "film room")):
                    continue
            selected.append(item)
            continue

        if "espn nfl" in label and len(slugs) == 0:
            selected.append(item)
            continue

        if len(slugs) == 0 and any(w in text for w in LEAGUE_TOPIC_WORDS):
            selected.append(item)

    return selected


def cluster_league_feed(items: list[dict], limit: int = 10) -> list[dict]:
    """Dedupe league feed items without assigning to a team."""
    if not items:
        return []

    sorted_items = sorted(
        items,
        key=lambda x: (x.get("source_tier", 3), -(x.get("engagement_score") or 0)),
    )
    used: set[int] = set()
    clusters: list[dict] = []

    for i, anchor in enumerate(sorted_items):
        if i in used:
            continue
        group = [anchor]
        used.add(i)
        for j, other in enumerate(sorted_items):
            if j in used or j <= i:
                continue
            if fuzz.token_sort_ratio(anchor.get("title", ""), other.get("title", "")) >= 72:
                group.append(other)
                used.add(j)
        best = min(group, key=lambda x: x.get("source_tier", 3))
        content_dates = sorted({g["content_date"] for g in group if g.get("content_date")})
        clusters.append(
            {
                "canonical_title": best.get("title"),
                "summary_seed": best.get("body") or best.get("title"),
                "source_urls": list({g["url"] for g in group})[:3],
                "tags": list({t for g in group for t in g.get("tags", [])}),
                "content_dates": content_dates,
            }
        )
    return clusters[:limit]
