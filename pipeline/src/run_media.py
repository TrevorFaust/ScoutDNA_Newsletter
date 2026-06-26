"""Daily media ingest: YouTube + podcasts -> newsletter_raw_items."""

import argparse
from datetime import date, datetime, timedelta

from .collectors.podcast_rss import collect_podcasts_for_date
from .collectors.youtube import collect_youtube_for_date
from .config import TZ
from .storage import fetch_team_id_map, log_pipeline_run, upsert_raw_items


def default_issue_date() -> date:
    return datetime.now(TZ).date()


def main() -> None:
    parser = argparse.ArgumentParser(description="YouTube + podcast collect")
    parser.add_argument("--date", type=str)
    parser.add_argument("--team", type=str, help="e.g. pittsburgh-steelers")
    parser.add_argument(
        "--all-teams",
        action="store_true",
        help="Ingest all 32 teams (slow). Prefer media_batch.ps1 with --workers.",
    )
    parser.add_argument("--max-videos", type=int)
    parser.add_argument("--max-episodes", type=int)
    parser.add_argument("--youtube-only", action="store_true")
    parser.add_argument("--podcasts-only", action="store_true")
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_issue_date()
    content_date = issue_date - timedelta(days=1)
    slug_to_id = fetch_team_id_map()

    team_slug = args.team
    if not team_slug and not args.all_teams:
        raise SystemExit(
            "Refusing full-league media without --team <slug> or --all-teams. "
            "Example: .\\media.ps1 -Date 2026-05-29 -Team pittsburgh-steelers -MaxVideos 1"
        )

    print(
        f"run_media: issue={issue_date}, content_date={content_date}, "
        f"team={team_slug or 'ALL'}, max_videos={args.max_videos}, max_episodes={args.max_episodes}"
    )

    all_items: list[dict] = []

    if not args.podcasts_only:
        print("=== YouTube ===")
        yt = collect_youtube_for_date(
            content_date,
            team_slug=team_slug,
            max_videos_per_channel=args.max_videos,
        )
        all_items.extend(yt)
        print(f"YouTube: {len(yt)} items")

    if not args.youtube_only:
        print("=== Podcasts ===")
        pods = collect_podcasts_for_date(
            content_date,
            team_slug=team_slug,
            max_episodes_per_feed=args.max_episodes,
        )
        all_items.extend(pods)
        print(f"Podcasts: {len(pods)} items")

    count = upsert_raw_items(all_items, slug_to_id) if all_items else 0
    log_pipeline_run(
        "collect",
        issue_date,
        "success" if count else "partial",
        items_collected=count,
        details={"source": "media", "total": len(all_items)},
    )
    print(f"Media ingest: {len(all_items)} items, upserted {count}.")
    print(f"Next: .\\compose.ps1 -Date {issue_date.isoformat()} -Team {args.team or 'pittsburgh-steelers'}")


if __name__ == "__main__":
    main()
