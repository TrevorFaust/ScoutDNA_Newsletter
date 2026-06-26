"""Collect new podcast episodes from podcasts_registry.csv."""

import argparse
from datetime import date, datetime, timedelta

from .collectors.podcast_rss import collect_podcasts_for_date
from .config import TZ
from .storage import fetch_team_id_map, log_pipeline_run, upsert_raw_items


def default_issue_date() -> date:
    return datetime.now(TZ).date()


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect podcast RSS for an issue")
    parser.add_argument("--date", type=str, help="Issue date YYYY-MM-DD")
    parser.add_argument("--team", type=str, help="Only this team slug")
    parser.add_argument("--max-episodes", type=int, help="Max episodes per feed")
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_issue_date()
    content_date = issue_date - timedelta(days=1)

    slug_to_id = fetch_team_id_map()
    if not slug_to_id:
        print("No teams in DB.")
        return

    log_pipeline_run("collect", issue_date, "started", details={"source": "podcast"})
    try:
        items = collect_podcasts_for_date(
            content_date,
            team_slug=args.team,
            max_episodes_per_feed=args.max_episodes,
        )
        count = upsert_raw_items(items, slug_to_id) if items else 0
        log_pipeline_run(
            "collect",
            issue_date,
            "success" if count else "partial",
            items_collected=count,
            details={"source": "podcast", "episodes": len(items)},
        )
        print(f"Podcasts: {len(items)} episodes, upserted {count} for issue {issue_date}.")
    except Exception as e:
        log_pipeline_run(
            "collect", issue_date, "failed", error_message=str(e), details={"source": "podcast"}
        )
        raise


if __name__ == "__main__":
    main()
