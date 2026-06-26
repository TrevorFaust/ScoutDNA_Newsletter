"""Run YouTube + podcast ingest for many teams in parallel (I/O bound)."""

from __future__ import annotations

import argparse
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta

from .collectors.podcast_rss import collect_podcasts_for_date
from .collectors.youtube import collect_youtube_for_date
from .config import TZ
from .storage import fetch_team_id_map, log_pipeline_run, upsert_raw_items
from .teams import load_teams


def default_issue_date() -> date:
    return datetime.now(TZ).date()


def _ingest_team(
    team_slug: str,
    content_date: date,
    *,
    max_videos: int | None,
    max_episodes: int | None,
    youtube_only: bool,
    podcasts_only: bool,
) -> tuple[str, list[dict], str | None]:
    items: list[dict] = []
    try:
        if not podcasts_only:
            items.extend(
                collect_youtube_for_date(
                    content_date,
                    team_slug=team_slug,
                    max_videos_per_channel=max_videos,
                )
            )
        if not youtube_only:
            items.extend(
                collect_podcasts_for_date(
                    content_date,
                    team_slug=team_slug,
                    max_episodes_per_feed=max_episodes,
                )
            )
        return team_slug, items, None
    except Exception as e:
        return team_slug, [], str(e)


def main() -> None:
    parser = argparse.ArgumentParser(description="Parallel media ingest per team")
    parser.add_argument("--date", type=str)
    parser.add_argument("--team", type=str, help="Single team only")
    parser.add_argument("--all-teams", action="store_true", help="All 32 team slugs")
    parser.add_argument("--workers", type=int, default=int(os.getenv("MEDIA_PARALLEL_WORKERS", "6")))
    parser.add_argument("--max-videos", type=int)
    parser.add_argument("--max-episodes", type=int)
    parser.add_argument("--youtube-only", action="store_true")
    parser.add_argument("--podcasts-only", action="store_true")
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_issue_date()
    content_date = issue_date - timedelta(days=1)
    teams = load_teams()
    slugs = [t.slug for t in teams]
    if args.team:
        slugs = [s for s in slugs if s == args.team]
        if not slugs:
            raise SystemExit(f"Unknown team slug: {args.team}")
    elif not args.all_teams:
        raise SystemExit("Pass --team <slug> or --all-teams")

    workers = max(1, min(args.workers, len(slugs)))
    print(
        f"Media batch: {len(slugs)} teams, {workers} workers, "
        f"content_date={content_date}, max_videos={args.max_videos}, max_episodes={args.max_episodes}"
    )

    slug_to_id = fetch_team_id_map()
    all_items: list[dict] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                _ingest_team,
                slug,
                content_date,
                max_videos=args.max_videos,
                max_episodes=args.max_episodes,
                youtube_only=args.youtube_only,
                podcasts_only=args.podcasts_only,
            ): slug
            for slug in slugs
        }
        for fut in as_completed(futures):
            slug, items, err = fut.result()
            if err:
                errors.append(f"{slug}: {err}")
                print(f"  FAIL {slug}: {err}")
            else:
                print(f"  done {slug}: {len(items)} items")
                all_items.extend(items)

    count = upsert_raw_items(all_items, slug_to_id) if all_items else 0
    status = "success" if count and not errors else ("partial" if count else "failed")
    log_pipeline_run(
        "collect",
        issue_date,
        status,
        items_collected=count,
        details={"source": "media_batch", "teams": len(slugs), "workers": workers, "errors": errors},
    )
    print(f"Batch complete: {len(all_items)} raw, upserted {count}, errors {len(errors)}")


if __name__ == "__main__":
    main()
