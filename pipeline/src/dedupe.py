from collections import defaultdict
from datetime import date

from thefuzz import fuzz

from .teams import Team


def _topic_key(title: str) -> str:
    return "".join(c for c in title.lower() if c.isalnum() or c.isspace()).strip()


def cluster_items(items: list[dict], teams: list[Team]) -> list[dict]:
    """Group raw items into story clusters per team (fuzzy title match)."""
    slug_to_team = {t.slug: t for t in teams}
    by_team: dict[str, list[dict]] = defaultdict(list)

    for item in items:
        slugs = item.get("team_slugs") or []
        if not slugs and item.get("team_ids"):
            continue
        if not slugs:
            text = f"{item.get('title', '')} {item.get('body', '')}"
            for team in teams:
                if any(kw in text.lower() for kw in team.keywords if len(kw) > 3):
                    slugs.append(team.slug)
        for slug in set(slugs):
            by_team[slug].append(item)

    clusters: list[dict] = []
    for slug, team_items in by_team.items():
        used: set[int] = set()
        sorted_items = sorted(
            team_items,
            key=lambda x: (x.get("source_tier", 3), -(x.get("engagement_score") or 0)),
        )
        for i, anchor in enumerate(sorted_items):
            if i in used:
                continue
            group = [anchor]
            used.add(i)
            for j, other in enumerate(sorted_items):
                if j in used or j <= i:
                    continue
                score = fuzz.token_sort_ratio(anchor.get("title", ""), other.get("title", ""))
                if score >= 72:
                    group.append(other)
                    used.add(j)
            best = min(group, key=lambda x: x.get("source_tier", 3))
            source_urls = list({g["url"] for g in group if g.get("url")})
            needs_review = any((g.get("metadata") or {}).get("needs_review") for g in group)
            clusters.append(
                {
                    "team_slug": slug,
                    "canonical_title": best.get("title"),
                    "summary_seed": best.get("body") or best.get("title"),
                    "priority": _priority(group),
                    "source_urls": source_urls[:8],
                    "source_count": len(group),
                    "tags": list({t for g in group for t in g.get("tags", [])}),
                    "needs_review": needs_review,
                    "raw_titles": [g.get("title") for g in group][:6],
                }
            )
    return clusters


def _priority(group: list[dict]) -> int:
    text = " ".join(g.get("title", "") for g in group).lower()
    if any(w in text for w in ("injury", "injured", "ir", "pup", "out", "questionable")):
        return 10
    if any(w in text for w in ("trade", "signed", "released", "waived")):
        return 20
    if any(w in text for w in ("camp", "ota", "minicamp", "practice")):
        return 30
    if any(w in text for w in ("rumor", "report", "sources")):
        return 50
    return 40
