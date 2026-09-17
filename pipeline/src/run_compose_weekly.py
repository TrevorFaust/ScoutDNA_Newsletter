"""Compose Tuesday weekly recap from collected items (prior Tue–Mon PT)."""
import argparse
import os
from datetime import date, datetime

import anthropic

from .compose import compose_issue_weekly, compose_team_section_weekly
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
from .teams import division_groups, load_teams
from .weekly_input import build_team_weekly_input
from .weekly_window import (
    content_dates_for_week,
    daily_issue_dates_for_week,
    is_weekly_issue_day,
)


def default_weekly_issue_date() -> date:
    return datetime.now(TZ).date()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose Tuesday weekly recap")
    parser.add_argument(
        "--date",
        type=str,
        help="Weekly issue date (Tuesday YYYY-MM-DD). Default: today PT.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow compose even if issue date is not a Tuesday (backfill).",
    )
    parser.add_argument(
        "--team",
        type=str,
        help="Recompose only these team slug(s), comma-separated (e.g. dallas-cowboys).",
    )
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_weekly_issue_date()
    if not is_weekly_issue_day(issue_date) and not args.force:
        raise SystemExit(
            f"Weekly issue date must be a Tuesday (got {issue_date}). Use --force for backfill."
        )

    teams = load_teams()
    compose_slugs: set[str] | None = None
    if args.team:
        compose_slugs = set()
        for token in args.team.split(","):
            token = token.strip()
            if not token:
                continue
            match = [t for t in teams if t.slug == token or t.abbrev == token]
            if not match:
                raise SystemExit(f"Unknown team: {token}. Use slug like dallas-cowboys")
            compose_slugs.add(match[0].slug)

    slug_to_id = fetch_team_id_map()
    week_start, week_end = content_dates_for_week(issue_date)
    daily_dates = daily_issue_dates_for_week(issue_date)

    log_pipeline_run(
        "compose",
        issue_date,
        "started",
        details={
            "mode": "weekly",
            "teams": sorted(compose_slugs) if compose_slugs else "all",
            "content_start": week_start.isoformat(),
            "content_end": week_end.isoformat(),
            "daily_issue_dates": [d.isoformat() for d in daily_dates],
        },
    )

    prior_context = fetch_prior_weekly_context(issue_date)

    try:
        issue = ensure_issue(issue_date, "weekly")
        issue_id = issue["id"]
        sb = get_client()

        if compose_slugs:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise RuntimeError("ANTHROPIC_API_KEY required for compose")
            client = anthropic.Anthropic(api_key=api_key)
            sections = []
            sort = 0
            for _div, div_teams in division_groups(teams).items():
                for team in div_teams:
                    sort += 1
                    if team.slug not in compose_slugs:
                        continue
                    team_input = build_team_weekly_input(
                        team, issue_date, teams, slug_to_id
                    )
                    section = compose_team_section_weekly(
                        client,
                        team,
                        team_input,
                        issue_date,
                        prior_context=prior_context,
                    )
                    section["sort_order"] = sort
                    section["team_slug"] = team.slug
                    sections.append(section)
            league_text = None
            league_footnotes = None
        else:
            league, sections = compose_issue_weekly(
                teams,
                issue_date,
                slug_to_id,
                prior_context=prior_context,
            )
            league_text = league["body"]
            league_footnotes = league.get("footnotes") or []

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

        issue_update: dict = {"status": "in_review"}
        if league_text is not None:
            issue_update["league_section"] = league_text
            issue_update["league_footnotes"] = league_footnotes or []
        sb.table(ISSUES).update(issue_update).eq("id", issue_id).execute()
        save_sections(issue_id, sb_sections)

        teams_with_content = sum(1 for s in sections if not s.get("is_empty"))
        log_pipeline_run(
            "compose",
            issue_date,
            "success",
            teams_with_items=teams_with_content,
            details={
                "mode": "weekly",
                "teams": sorted(compose_slugs) if compose_slugs else "all",
            },
        )
        slug = f"{issue_date.isoformat()}-weekly"
        if compose_slugs:
            print(
                f"Weekly team recompose ready for {', '.join(sorted(compose_slugs))} "
                f"— review at /admin/review/{slug}"
            )
        else:
            print(f"Weekly draft ready for {issue_date} — review at /admin/review/{slug}")
    except Exception as e:
        log_pipeline_run(
            "compose", issue_date, "failed", error_message=str(e), details={"mode": "weekly"}
        )
        raise


if __name__ == "__main__":
    main()
