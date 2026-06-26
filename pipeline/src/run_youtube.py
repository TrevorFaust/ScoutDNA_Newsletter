"""Collect YouTube transcripts into newsletter_raw_items."""

import argparse
from datetime import date, datetime, timedelta

from .collectors.youtube import collect_youtube_for_date
from .config import TZ
from .storage import fetch_team_id_map, log_pipeline_run, upsert_raw_items


def default_issue_date() -> date:
    return datetime.now(TZ).date()


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe YouTube sources for an issue")
    parser.add_argument("--date", type=str, help="Issue date YYYY-MM-DD (default: today PT)")
    parser.add_argument("--url", type=str, help="Single video URL (skips youtube_sources.csv)")
    parser.add_argument(
        "--max-videos",
        type=int,
        help="Max videos per channel (default: env YOUTUBE_MAX_VIDEOS_PER_CHANNEL or 5)",
    )
    parser.add_argument("--whisper-model", type=str, help="Whisper model (default: env or base)")
    parser.add_argument(
        "--team",
        type=str,
        help="Only channels for this team slug (e.g. pittsburgh-steelers)",
    )
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_issue_date()
    content_date = issue_date - timedelta(days=1)

    slug_to_id = fetch_team_id_map()
    if not slug_to_id and not args.url:
        print("No teams in DB — run migrations first.")
        return

    log_pipeline_run("collect", issue_date, "started", details={"source": "youtube"})
    try:
        items = collect_youtube_for_date(
            content_date,
            max_videos_per_channel=args.max_videos,
            whisper_model=args.whisper_model,
            single_url=args.url,
            team_slug=args.team,
        )
        count = upsert_raw_items(items, slug_to_id) if items else 0
        log_pipeline_run(
            "collect",
            issue_date,
            "success" if count else "failed",
            items_collected=count,
            details={
                "source": "youtube",
                "content_date": content_date.isoformat(),
                "videos": len(items),
            },
        )
        print(f"YouTube: {len(items)} transcripts, upserted {count} rows for issue {issue_date}.")
        print(f"Next: .\\compose.ps1 -Date {issue_date.isoformat()} -Team pittsburgh-steelers")
    except Exception as e:
        log_pipeline_run(
            "collect", issue_date, "failed", error_message=str(e), details={"source": "youtube"}
        )
        raise


if __name__ == "__main__":
    main()
