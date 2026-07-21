"""Compose Monday weekly recap from daily editions (Mon–Sun prior week)."""
import argparse
from datetime import date, datetime

from .compose import compose_issue_weekly
from .config import TZ
from .db import get_client
from .storage import (
    _issue_title,
    ensure_issue,
    fetch_prior_weekly_context,
    fetch_team_id_map,
    log_pipeline_run,
    save_sections,
)
from .tables import ISSUES
from .teams import load_teams
from .weekly_window import content_dates_for_week, daily_issue_dates_for_week, is_monday


def default_weekly_issue_date() -> date:
    return datetime.now(TZ).date()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose Monday weekly recap")
    parser.add_argument(
        "--date",
        type=str,
        help="Weekly issue date (Monday YYYY-MM-DD). Default: today PT.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow compose even if issue date is not a Monday (backfill).",
    )
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_weekly_issue_date()
    if not is_monday(issue_date) and not args.force:
        raise SystemExit(
            f"Weekly issue date must be a Monday (got {issue_date}). Use --force for backfill."
        )

    teams = load_teams()
    slug_to_id = fetch_team_id_map()
    monday, sunday = content_dates_for_week(issue_date)
    daily_dates = daily_issue_dates_for_week(issue_date)

    log_pipeline_run(
        "compose",
        issue_date,
        "started",
        details={
            "mode": "weekly",
            "content_monday": monday.isoformat(),
            "content_sunday": sunday.isoformat(),
            "daily_issue_dates": [d.isoformat() for d in daily_dates],
        },
    )

    prior_context = fetch_prior_weekly_context(issue_date)

    try:
        league, sections = compose_issue_weekly(
            teams,
            issue_date,
            slug_to_id,
            prior_context=prior_context,
        )
        league_text = league["body"]
        league_footnotes = league.get("footnotes") or []

        issue = ensure_issue(issue_date, "weekly")
        issue_id = issue["id"]
        sb = get_client()
        sb.table(ISSUES).update({"title": _issue_title(issue_date, "weekly")}).eq(
            "id", issue_id
        ).execute()

        sb_sections = []
        for sec in sections:
            team_id = slug_to_id.get(sec["team_slug"])
            if not team_id:
                continue
            sb_sections.append(
                {
                    "team_id": team_id,
                    "intro_paragraphs": sec.get("intro_paragraphs"),
                    "rookie_paragraph": sec.get("rookie_paragraph"),
                    "activity_markdown": sec.get("activity_markdown"),
                    "talk_markdown": sec.get("talk_markdown"),
                    "fantasy_markdown": sec.get("fantasy_markdown"),
                    "footnotes": sec.get("footnotes", []),
                    "tags": sec.get("tags", []),
                    "flags": sec.get("flags", []),
                    "is_empty": sec.get("is_empty", False),
                    "empty_reason": sec.get("empty_reason"),
                    "sort_order": sec["sort_order"],
                }
            )

        sb.table(ISSUES).update(
            {
                "league_section": league_text,
                "league_footnotes": league_footnotes,
                "status": "in_review",
            }
        ).eq("id", issue_id).execute()
        save_sections(issue_id, sb_sections)

        teams_with_content = sum(1 for s in sections if not s.get("is_empty"))
        log_pipeline_run(
            "compose",
            issue_date,
            "success",
            teams_with_items=teams_with_content,
            details={"mode": "weekly"},
        )
        slug = f"{issue_date.isoformat()}-weekly"
        print(f"Weekly draft ready for {issue_date} — review at /admin/review/{slug}")
    except Exception as e:
        log_pipeline_run("compose", issue_date, "failed", error_message=str(e), details={"mode": "weekly"})
        raise


if __name__ == "__main__":
    main()
