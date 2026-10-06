"""Cluster items and compose newsletter draft via Claude."""
import argparse
import os
from datetime import date, datetime, timedelta

import anthropic

from .compose import compose_issue, compose_league_section, compose_team_section
from .recovery import ATTEMPTS, exhausted_message, leak_hits, scrub_section, split_leak_hits
from .config import TZ
from .db import get_client
from .dedupe import cluster_items
from .league_feed import cluster_league_feed, extract_league_feed_items
from .storage import (
    ensure_issue,
    fetch_prior_issue_context,
    fetch_raw_items_for_date,
    fetch_team_id_map,
    log_pipeline_run,
    save_sections,
)
from .time_window import filter_raw_by_issue_window
from .tables import ISSUES
from .teams import load_teams


def default_issue_date() -> date:
    return datetime.now(TZ).date()


def _replace_team_section(sections: list[dict], slug: str, new_section: dict) -> None:
    for index, sec in enumerate(sections):
        if sec.get("team_slug") != slug:
            continue
        new_section["sort_order"] = sec.get("sort_order")
        new_section["team_slug"] = slug
        sections[index] = new_section
        return


def _repair_daily_leaks(
    client: anthropic.Anthropic,
    teams: list,
    sections: list[dict],
    league_text: str,
    league_footnotes: list,
    clusters_by_slug: dict[str, list[dict]],
    league_clusters: list[dict],
    issue_date: date,
    prior_context: str,
) -> tuple[str, list]:
    """Recompose only the daily sections that still contain internal field names."""
    from .compose import scrub_internal_flag_names

    errors: list[str] = []
    for attempt in range(1, ATTEMPTS + 1):
        for sec in sections:
            scrub_section(sec)
        league_text = scrub_internal_flag_names(league_text)
        hits = leak_hits(sections, league_text)
        if not hits:
            return league_text, league_footnotes
        summary = ", ".join(hits[:20])
        errors.append(summary)
        print(
            f"[recover] daily compose attempt {attempt}/{ATTEMPTS} still has leaked tokens: {summary}",
            flush=True,
        )
        if attempt == ATTEMPTS:
            raise RuntimeError(exhausted_message("daily compose", errors))
        by_slug, league_tokens = split_leak_hits(hits)
        team_by_slug = {team.slug: team for team in teams}
        for slug, tokens in by_slug.items():
            team = team_by_slug.get(slug)
            if team is None:
                continue
            print(
                f"[recover] recomposing {slug} without {', '.join(sorted(tokens))}",
                flush=True,
            )
            section = compose_team_section(
                client,
                team,
                clusters_by_slug.get(slug, []),
                issue_date,
                prior_context=prior_context,
                forbid_tokens=sorted(tokens),
            )
            section["sort_order"] = next(
                (sec.get("sort_order") for sec in sections if sec.get("team_slug") == slug),
                section.get("sort_order"),
            )
            _replace_team_section(sections, slug, section)
        if league_tokens:
            print(
                "[recover] recomposing league section without "
                + ", ".join(sorted(league_tokens)),
                flush=True,
            )
            league = compose_league_section(
                client,
                league_clusters,
                issue_date,
                prior_context=prior_context,
                forbid_tokens=sorted(league_tokens),
            )
            league_text = league["body"]
            league_footnotes = league.get("footnotes") or []
    raise RuntimeError(exhausted_message("daily compose", errors))


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose newsletter draft")
    parser.add_argument("--date", type=str, help="Issue date YYYY-MM-DD")
    parser.add_argument(
        "--team",
        type=str,
        help="Compose only this team slug (e.g. buffalo-bills). Others get placeholder sections.",
    )
    args = parser.parse_args()

    issue_date = date.fromisoformat(args.date) if args.date else default_issue_date()
    content_date = issue_date - timedelta(days=1)
    teams = load_teams()
    if args.team:
        compose_slugs: set[str] | None = set()
        for token in args.team.split(","):
            token = token.strip()
            if not token:
                continue
            match = [t for t in teams if t.slug == token or t.abbrev == token]
            if not match:
                raise SystemExit(f"Unknown team: {token}. Use slug like buffalo-bills")
            compose_slugs.add(match[0].slug)
        if not compose_slugs:
            compose_slugs = None
    else:
        compose_slugs = None
    slug_to_id = fetch_team_id_map()

    log_pipeline_run("compose", issue_date, "started")
    raw = fetch_raw_items_for_date(content_date)
    raw = filter_raw_by_issue_window(raw, issue_date)
    if not raw:
        print(
            f"WARNING: no raw items in publish window for content_date {content_date}. "
            f"Re-run collect --date {issue_date.isoformat()} after migration 008."
        )
    prior_context = fetch_prior_issue_context(issue_date)

    # Normalize for clustering
    normalized = []
    id_to_slug = {v: k for k, v in slug_to_id.items()}
    for row in raw:
        slugs = [id_to_slug[tid] for tid in row.get("team_ids", []) if tid in id_to_slug]
        normalized.append({**row, "team_slugs": slugs})

    clusters = cluster_items(normalized, teams)
    by_slug: dict[str, list[dict]] = {}
    for c in clusters:
        by_slug.setdefault(c["team_slug"], []).append(c)

    league_clusters = cluster_league_feed(extract_league_feed_items(normalized))

    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY required for compose")
        client = anthropic.Anthropic(api_key=api_key)
        if compose_slugs:
            league = compose_league_section(
                client, league_clusters, issue_date, prior_context=prior_context
            )
            league_text = league["body"]
            league_footnotes = league.get("footnotes") or []
            sections = []
            sort = 0
            from .teams import division_groups

            for _div, div_teams in division_groups(teams).items():
                for team in div_teams:
                    sort += 1
                    if team.slug in compose_slugs:
                        sec = compose_team_section(
                            client,
                            team,
                            by_slug.get(team.slug, []),
                            issue_date,
                            prior_context=prior_context,
                        )
                    else:
                        sec = {
                            "intro_paragraphs": None,
                            "rookie_paragraph": None,
                            "activity_markdown": "_Section not composed in test run._",
                            "talk_markdown": "",
                            "fantasy_markdown": None,
                            "footnotes": [],
                            "tags": [],
                            "flags": ["skipped:test-run"],
                            "is_empty": True,
                            "empty_reason": "Skipped — use full compose for all teams.",
                        }
                    sec["sort_order"] = sort
                    sec["team_slug"] = team.slug
                    sections.append(sec)
        else:
            league, sections = compose_issue(
                teams, by_slug, league_clusters, issue_date, prior_context=prior_context
            )
            league_text = league["body"]
            league_footnotes = league.get("footnotes") or []

        league_text, league_footnotes = _repair_daily_leaks(
            client,
            teams,
            sections,
            league_text,
            league_footnotes,
            by_slug,
            league_clusters,
            issue_date,
            prior_context,
        )

        issue = ensure_issue(issue_date, "daily")
        issue_id = issue["id"]
        sb = get_client()
        sb.table(ISSUES).update(
            {"title": issue_date.strftime("%B %d, %Y")}
        ).eq("id", issue_id).execute()

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
        log_pipeline_run("compose", issue_date, "success", teams_with_items=len(by_slug))
        print(f"Draft ready for {issue_date} — review in web admin.")
    except Exception as e:
        log_pipeline_run("compose", issue_date, "failed", error_message=str(e))
        raise


if __name__ == "__main__":
    main()
