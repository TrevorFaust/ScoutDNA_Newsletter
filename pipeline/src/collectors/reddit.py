import hashlib
import os
from datetime import date, datetime

import httpx

from ..teams import Team
from ..time_window import issue_date_for_content_date, published_in_issue_window

REDDIT_BASE = "https://www.reddit.com"
GOOD_FLAIRS = {
    "official",
    "news",
    "injury",
    "rumor",
    "analysis",
    "fantasy",
    "camp",
    "roster",
}


def _headers() -> dict[str, str]:
    ua = os.getenv("REDDIT_USER_AGENT", "DraftDNA-NFL-Newsletter/1.0")
    return {"User-Agent": ua}


def _parse_created(created_utc: float) -> datetime:
    return datetime.utcfromtimestamp(created_utc)


def _item_from_post(
    post: dict,
    *,
    content_date: date,
    team: Team | None,
    source_label: str,
    source_tier: int,
) -> dict | None:
    flair_raw = post.get("link_flair_text") or ""
    if post.get("stickied") and flair_raw.lower() in ("meme", "shitpost"):
        return None
    title = (post.get("title") or "").strip()
    if not title:
        return None
    url = post.get("url") or f"{REDDIT_BASE}{post.get('permalink', '')}"
    permalink = f"{REDDIT_BASE}{post.get('permalink', '')}"
    flair = (post.get("link_flair_text") or "").strip()
    body = (post.get("selftext") or "")[:4000]
    published = _parse_created(post["created_utc"])
    issue_date = issue_date_for_content_date(content_date)
    if not published_in_issue_window(published.isoformat(), issue_date):
        return None
    engagement = int(post.get("ups", 0))
    needs_review = flair.lower() in ("rumor", "speculation") or engagement < 5
    if flair and flair.lower() in GOOD_FLAIRS:
        needs_review = needs_review and flair.lower() == "rumor"

    url_hash = hashlib.sha256(permalink.encode()).hexdigest()
    tags = ["reddit"]
    if flair:
        tags.append(flair.lower())
    if post.get("stickied"):
        tags.append("pinned")

    team_ids: list[str] = []
    if team:
        team_ids = [team.slug]

    return {
        "external_id": post.get("id"),
        "url": permalink,
        "url_hash": url_hash,
        "title": title,
        "body": body or None,
        "author": post.get("author"),
        "published_at": published.isoformat(),
        "content_date": content_date.isoformat(),
        "source_type": "reddit",
        "source_tier": source_tier,
        "flair": flair or None,
        "engagement_score": engagement,
        "team_slugs": team_ids,
        "tags": tags,
        "metadata": {
            "source_label": source_label,
            "original_url": url,
            "needs_review": needs_review,
            "subreddit": post.get("subreddit"),
        },
    }


def _fetch_listing(client: httpx.Client, path: str, *, limit: int = 25) -> list[dict]:
    resp = client.get(f"{REDDIT_BASE}{path}", params={"limit": limit}, headers=_headers(), timeout=30)
    resp.raise_for_status()
    children = resp.json().get("data", {}).get("children", [])
    return [c["data"] for c in children]


def _skip_nfl_sub() -> bool:
    return os.getenv("REDDIT_RSS_SKIP_NFL", "").lower() in ("1", "true", "yes")


def _collect_reddit_json(
    teams: list[Team],
    content_date: date,
    *,
    team_limit: int = 15,
    nfl_limit: int = 30,
) -> list[dict]:
    items: list[dict] = []
    skip_nfl = _skip_nfl_sub() or nfl_limit <= 0
    with httpx.Client() as client:
        if not skip_nfl:
            try:
                for post in _fetch_listing(client, "/r/nfl/new.json", limit=nfl_limit):
                    mapped = _item_from_post(
                        post,
                        content_date=content_date,
                        team=None,
                        source_label="r/nfl",
                        source_tier=1,
                    )
                    if mapped:
                        items.append(mapped)
            except httpx.HTTPError as e:
                print(f"  JSON skip r/nfl: {e}")

        for team in teams:
            path = f"/r/{team.reddit}/new.json"
            try:
                posts = _fetch_listing(client, path, limit=team_limit)
            except httpx.HTTPError:
                continue
            for post in posts:
                mapped = _item_from_post(
                    post,
                    content_date=content_date,
                    team=team,
                    source_label=f"r/{team.reddit}",
                    source_tier=2,
                )
                if mapped:
                    items.append(mapped)
    return items


def collect_reddit(
    teams: list[Team],
    content_date: date,
    *,
    team_limit: int = 15,
    nfl_limit: int = 30,
) -> list[dict]:
    """
    Prefer RSS (no API app). Optional REDDIT_USE_JSON=true forces legacy .json.
    """
    use_json = os.getenv("REDDIT_USE_JSON", "").lower() in ("1", "true", "yes")
    if not use_json:
        try:
            from .reddit_rss import collect_reddit_rss

            rss_nfl_limit = 0 if _skip_nfl_sub() else nfl_limit
            items = collect_reddit_rss(
                teams, content_date, team_limit=team_limit, nfl_limit=rss_nfl_limit
            )
            if items:
                print(f"Reddit RSS: {len(items)} posts")
                return items
            print("Reddit RSS: 0 posts in window — trying JSON fallback")
        except Exception as e:
            print(f"Reddit RSS failed ({e}) — trying JSON fallback")

    if not os.getenv("REDDIT_USER_AGENT", "").strip():
        print("Reddit JSON skipped — set REDDIT_USER_AGENT in .env (contact email in the string).")
        return []
    try:
        json_nfl_limit = 0 if _skip_nfl_sub() else nfl_limit
        items = _collect_reddit_json(
            teams, content_date, team_limit=team_limit, nfl_limit=json_nfl_limit
        )
        if items:
            print(f"Reddit JSON: {len(items)} posts")
        return items
    except httpx.HTTPError as e:
        print(f"Reddit JSON failed: {e}")
        return []
