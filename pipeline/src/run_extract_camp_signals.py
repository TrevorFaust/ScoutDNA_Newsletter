"""Extract camp signals from raw items and rebuild rolling slot scores."""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta

from .aggregate_camp_signals import aggregate_camp_signals
from .camp_signals_common import DEFAULT_WINDOW_DAYS
from .config import TZ
from .extract_camp_signals import extract_camp_signals_for_date
from .propose_battle_changes import propose_battle_changes


def default_issue_date() -> date:
    return datetime.now(TZ).date()


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract camp signals and aggregate scores")
    parser.add_argument(
        "--date",
        type=str,
        help="Issue date YYYY-MM-DD (content window = prior day; same as collect.ps1)",
    )
    parser.add_argument("--team", type=str, help="Team abbrev only, e.g. BAL")
    parser.add_argument(
        "--skip-extract",
        action="store_true",
        help="Only rebuild aggregates from existing signals",
    )
    parser.add_argument(
        "--skip-propose",
        action="store_true",
        help="Rebuild scores but don't touch the camp_battle_proposals queue",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=DEFAULT_WINDOW_DAYS,
        help=f"Rolling window for scores (default {DEFAULT_WINDOW_DAYS})",
    )
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_issue_date()
    content_date = issue_date - timedelta(days=1)
    team = args.team.upper() if args.team else None

    try:
        extracted = {"teams": 0, "signals": 0}
        if not args.skip_extract:
            extracted = extract_camp_signals_for_date(content_date, team_abbr=team)
            print(
                f"Extracted {extracted['signals']} signal(s) across "
                f"{extracted['teams']} team(s) for content {content_date}"
            )
        else:
            print("Skipping extraction (--skip-extract)")

        n_scores = aggregate_camp_signals(
            content_date,
            window_days=args.window_days,
            team_abbr=team,
        )
        print(f"Rebuilt {n_scores} camp_slot_scores row(s) ({args.window_days}-day window)")

        if not args.skip_propose:
            proposal_counts = propose_battle_changes(
                content_date,
                window_days=args.window_days,
                team_abbr=team,
            )
            print(
                f"Proposals: {proposal_counts['proposed']} new, "
                f"{proposal_counts['updated']} refreshed, {proposal_counts['expired']} expired "
                "-- review at /admin/camp-signals"
            )
        else:
            print("Skipping proposal queue (--skip-propose)")
    except Exception as e:
        print(f"Camp signals failed: {e}")
        raise


if __name__ == "__main__":
    main()
