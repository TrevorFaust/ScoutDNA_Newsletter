"""Collect Reddit + RSS for prior calendar day (PT)."""
import argparse
import os
from datetime import date, datetime, timedelta

from .collectors import collect_reddit, collect_rss
from .config import TZ
from .db import get_client
from .storage import (
    ensure_issue,
    fetch_team_id_map,
    log_pipeline_run,
    mark_issue_collected,
    upsert_raw_items,
)
from .teams import load_teams


def default_issue_date() -> date:
    now = datetime.now(TZ)
    return now.date()


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect NFL news items")
    parser.add_argument("--date", type=str, help="Issue date YYYY-MM-DD (default: today PT)")
    parser.add_argument(
        "--team",
        type=str,
        help="Collect only this team slug (e.g. pittsburgh-steelers); skips other subs to reduce Reddit rate limits",
    )
    parser.add_argument(
        "--skip-reddit",
        action="store_true",
        help="Skip Reddit (RSS + ESPN only). Also set REDDIT_SKIP=1 in .env.",
    )
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_issue_date()
    content_date = issue_date - timedelta(days=1)
    today_pt = default_issue_date()
    days_off = (issue_date - today_pt).days
    if days_off < -1 or days_off > 1:
        print(
            f"NOTE: issue_date {issue_date} is {abs(days_off)} day(s) from today PT ({today_pt}). "
            f"Collect only keeps posts published on content_date {content_date} (midnight–midnight PT). "
            f"Old/future dates often yield 0 items — omit --date for today's issue."
        )

    teams = load_teams()
    if args.team:
        match = [t for t in teams if t.slug == args.team or t.abbrev == args.team.lower()]
        if not match:
            raise SystemExit(f"Unknown team: {args.team}")
        teams = match
        os.environ.setdefault("REDDIT_RSS_SKIP_NFL", "1")
        print(f"Collecting Reddit/RSS for {match[0].name} only (r/nfl skipped)")
    slug_to_id = fetch_team_id_map()
    if not slug_to_id:
        print("No teams in DB — run Supabase migrations + seed first.")
        return

    skip_reddit = args.skip_reddit or os.getenv("REDDIT_SKIP", "").lower() in ("1", "true", "yes")

    log_pipeline_run("collect", issue_date, "started")
    items: list[dict] = []

    if skip_reddit:
        print("Reddit skipped (RSS + media only for this run).")
    else:
        try:
            reddit_items = collect_reddit(teams, content_date)
            items.extend(reddit_items)
        except Exception as e:
            log_pipeline_run("collect", issue_date, "partial", error_message=f"reddit: {e}")
            print(f"Reddit failed: {e}")

    try:
        rss_items = collect_rss(teams, content_date)
        items.extend(rss_items)
        if rss_items:
            print(f"ESPN RSS: {len(rss_items)} items")
    except Exception as e:
        print(f"RSS failed: {e}")

    if args.team:
        try:
            from .collectors.podcast_rss import collect_podcasts_for_date

            pod_items = collect_podcasts_for_date(
                content_date, team_slug=args.team, max_episodes_per_feed=3
            )
            items.extend(pod_items)
            print(f"Podcasts: {len(pod_items)} items")
        except Exception as e:
            print(f"Podcast collect failed: {e}")

    # Attach team slugs on rss items that matched keywords
    for item in items:
        if not item.get("team_slugs") and item.get("team_ids"):
            continue

    count = upsert_raw_items(items, slug_to_id)
    teams_hit = len({s for i in items for s in i.get("team_slugs", [])})

    issue = ensure_issue(issue_date, "daily")
    if count:
        mark_issue_collected(issue_date, "daily")
    status = "success" if count else "failed"
    log_pipeline_run(
        "collect",
        issue_date,
        status,
        items_collected=count,
        teams_with_items=teams_hit,
        details={"content_date": content_date.isoformat(), "raw_fetched": len(items)},
    )
    print(f"Collected {len(items)} items, upserted {count}, teams with news: {teams_hit}")
    print(f"Issue {issue_date} status: collected (raw news only — run compose next).")
    print(f"  python -m src.run_compose --date {issue_date.isoformat()} --team pittsburgh-steelers")

    if count == 0:
        print("WARNING: zero items — set REDDIT_USER_AGENT in .env and check RSS/network.")


if __name__ == "__main__":
    main()
