"""
Copy one newsletter issue from the OLD ScoutDNA-only Supabase project (msfhp)
into the shared DraftDNA database (paveh).

Usage:
  1. Add to .env (do not commit):
     OLD_SUPABASE_URL=https://msfhpjfhrtzmhxyjoldp.supabase.co
     OLD_SUPABASE_SERVICE_ROLE_KEY=<service role from msfhp API page>

  2. Run from pipeline/:
     python -m src.recover_issue --date 2026-05-19

Reads issue + sections from old project (tries newsletter_* then legacy table names).
Writes into current SUPABASE_URL (paveh) newsletter_* tables.
"""

import argparse
from datetime import date

from .config import require_env  # loads repo root .env
from .db import get_client
from .tables import ISSUES, SECTIONS, TEAMS


def _old_client():
    import os
    from supabase import create_client

    url = require_env("OLD_SUPABASE_URL")
    key = os.getenv("OLD_SUPABASE_SERVICE_ROLE_KEY") or require_env(
        "OLD_SUPABASE_SERVICE_ROLE_KEY"
    )
    return create_client(url, key)


def _fetch_issue(old, slug: str) -> dict | None:
    r = (
        old.table("newsletter_issues")
        .select("*")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    return r.data[0] if r.data else None


def _old_team_id_to_slug(old) -> dict[str, str]:
    for table in (TEAMS, "teams"):
        try:
            rows = old.table(table).select("id, slug").execute().data or []
            if rows:
                return {r["id"]: r["slug"] for r in rows}
        except Exception:
            continue
    return {}


def _fetch_sections(old, issue_id: str) -> list[dict]:
    try:
        r = (
            old.table(SECTIONS)
            .select("*, newsletter_teams(slug)")
            .eq("issue_id", issue_id)
            .order("sort_order")
            .execute()
        )
        if r.data:
            return r.data
    except Exception:
        pass
    try:
        r = (
            old.table("newsletter_sections")
            .select("*, teams(slug)")
            .eq("issue_id", issue_id)
            .order("sort_order")
            .execute()
        )
        return r.data or []
    except Exception:
        r = (
            old.table("newsletter_sections")
            .select("*")
            .eq("issue_id", issue_id)
            .order("sort_order")
            .execute()
        )
        return r.data or []


def _team_slug_from_section(sec: dict, old_team_map: dict[str, str]) -> str | None:
    if sec.get("newsletter_teams"):
        return sec["newsletter_teams"].get("slug")
    if sec.get("teams"):
        t = sec["teams"]
        return t.get("slug") if isinstance(t, dict) else None
    tid = sec.get("team_id")
    return old_team_map.get(tid) if tid else None


def recover(slug: str) -> None:
    old = _old_client()
    new = get_client()

    issue = _fetch_issue(old, slug)
    if not issue:
        print(f"No issue with slug {slug} on OLD Supabase project.")
        print("Check Table Editor: newsletter_issues, filter slug =", slug)
        return

    print(f"Found on OLD: {issue.get('title')} status={issue.get('status')}")

    sections = _fetch_sections(old, issue["id"])
    print(f"Found {len(sections)} sections on OLD.")
    old_team_map = _old_team_id_to_slug(old)

    new_teams = new.table(TEAMS).select("id, slug").execute().data or []
    slug_to_id = {t["slug"]: t["id"] for t in new_teams}

    issue_row = {
        "issue_date": issue["issue_date"],
        "issue_type": issue.get("issue_type", "daily"),
        "slug": issue["slug"],
        "title": issue["title"],
        "status": issue.get("status", "in_review"),
        "league_section": issue.get("league_section"),
        "published_at": issue.get("published_at"),
    }

    upserted = (
        new.table(ISSUES)
        .upsert(issue_row, on_conflict="issue_date,issue_type")
        .execute()
    )
    new_issue = upserted.data[0] if upserted.data else None
    if not new_issue:
        r = (
            new.table(ISSUES)
            .select("*")
            .eq("slug", slug)
            .limit(1)
            .execute()
        )
        new_issue = r.data[0]

    new_issue_id = new_issue["id"]
    print(f"Upserted issue on NEW DB: {new_issue_id}")

    saved = 0
    for sec in sections:
        team_slug = _team_slug_from_section(sec, old_team_map)
        if not team_slug and sec.get("team_id"):
            print("  skip section without slug mapping")
            continue
        team_id = slug_to_id.get(team_slug)
        if not team_id:
            print(f"  skip unknown team slug: {team_slug}")
            continue
        row = {
            "issue_id": new_issue_id,
            "team_id": team_id,
            "intro_paragraphs": sec.get("intro_paragraphs"),
            "rookie_paragraph": sec.get("rookie_paragraph"),
            "activity_markdown": sec.get("activity_markdown"),
            "talk_markdown": sec.get("talk_markdown"),
            "footnotes": sec.get("footnotes") or [],
            "tags": sec.get("tags") or [],
            "flags": sec.get("flags") or [],
            "is_empty": sec.get("is_empty", False),
            "empty_reason": sec.get("empty_reason"),
            "sort_order": sec.get("sort_order", 0),
        }
        new.table(SECTIONS).upsert(row, on_conflict="issue_id,team_id").execute()
        saved += 1

    print(f"Copied {saved} sections to paveh. Open /issue/{slug}")
    print("Review: /admin/review/" + slug)


def main() -> None:
    parser = argparse.ArgumentParser(description="Recover issue from old Supabase project")
    parser.add_argument("--date", required=True, help="Issue slug YYYY-MM-DD")
    args = parser.parse_args()
    recover(args.date)


if __name__ == "__main__":
    main()
