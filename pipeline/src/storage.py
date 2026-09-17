from datetime import date, datetime, timedelta

from .db import get_client
from .tables import ISSUES, PIPELINE_RUNS, RAW_ITEMS, SECTIONS, TEAMS
from .teams import Team


def fetch_team_id_map() -> dict[str, str]:
    sb = get_client()
    rows = sb.table(TEAMS).select("id, slug").execute().data or []
    return {r["slug"]: r["id"] for r in rows}


def upsert_raw_items(items: list[dict], slug_to_id: dict[str, str]) -> int:
    sb = get_client()
    inserted = 0
    for item in items:
        team_ids = [slug_to_id[s] for s in item.get("team_slugs", []) if s in slug_to_id]
        row = {
            "external_id": item.get("external_id"),
            "url": item["url"],
            "url_hash": item["url_hash"],
            "title": item["title"],
            "body": item.get("body"),
            "author": item.get("author"),
            "published_at": item.get("published_at"),
            "content_date": item["content_date"],
            "source_type": item["source_type"],
            "source_tier": item.get("source_tier", 2),
            "flair": item.get("flair"),
            "engagement_score": item.get("engagement_score", 0),
            "team_ids": team_ids,
            "tags": item.get("tags", []),
            "metadata": item.get("metadata", {}),
        }
        try:
            sb.table(RAW_ITEMS).upsert(row, on_conflict="url_hash,content_date").execute()
            inserted += 1
        except Exception:
            continue
    return inserted


def log_pipeline_run(
    run_type: str,
    content_date: date | None,
    status: str,
    *,
    items_collected: int = 0,
    teams_with_items: int = 0,
    error_message: str | None = None,
    details: dict | None = None,
) -> None:
    sb = get_client()
    sb.table(PIPELINE_RUNS).insert(
        {
            "run_type": run_type,
            "content_date": content_date.isoformat() if content_date else None,
            "status": status,
            "items_collected": items_collected,
            "teams_with_items": teams_with_items,
            "error_message": error_message,
            "details": details or {},
            "finished_at": datetime.utcnow().isoformat(),
        }
    ).execute()


def fetch_prior_issue_context(issue_date: date, *, max_snippets: int = 6) -> str:
    """Summarize prior issue so compose avoids repeating the same stories."""
    prev_slug = (issue_date - timedelta(days=1)).isoformat()
    sb = get_client()
    prev = (
        sb.table(ISSUES)
        .select("id, league_section")
        .eq("slug", prev_slug)
        .limit(1)
        .execute()
    )
    if not prev.data:
        return ""
    row = prev.data[0]
    parts: list[str] = []
    league = row.get("league_section") or ""
    if league.strip():
        parts.append(f"League: {league[:500]}")
    secs = (
        sb.table(SECTIONS)
        .select("intro_paragraphs, activity_markdown")
        .eq("issue_id", row["id"])
        .order("sort_order")
        .limit(12)
        .execute()
    )
    for sec in secs.data or []:
        for key in ("intro_paragraphs", "activity_markdown"):
            text = (sec.get(key) or "").strip()
            if text and len(text) > 40:
                parts.append(text[:280])
                break
        if len(parts) >= max_snippets:
            break
    if not parts:
        return ""
    joined = "\n---\n".join(parts[:max_snippets])
    return (
        "Yesterday's edition already covered the following. "
        "Do NOT repeat unless inputs show a clear NEW development (injury update, new quote, "
        "the game/return/decision that the earlier story was waiting on). "
        "If yesterday previewed a later event and today's inputs close it, write the follow-up:\n"
        f"{joined}"
    )


def _fetch_raw_items_paginated(build_query) -> list[dict]:
    """PostgREST caps a single execute at 1000 rows; page so weekly windows are complete."""
    page = 1000
    rows: list[dict] = []
    start = 0
    while True:
        resp = build_query().range(start, start + page - 1).execute()
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page:
            break
        start += page
    return rows


def fetch_raw_items_for_date(content_date: date) -> list[dict]:
    sb = get_client()

    def build_query():
        return (
            sb.table(RAW_ITEMS)
            .select("*")
            .eq("content_date", content_date.isoformat())
            .order("content_date")
            .order("url_hash")
        )

    return _fetch_raw_items_paginated(build_query)


def fetch_raw_items_for_range(content_start: date, content_end: date) -> list[dict]:
    sb = get_client()

    def build_query():
        return (
            sb.table(RAW_ITEMS)
            .select("*")
            .gte("content_date", content_start.isoformat())
            .lte("content_date", content_end.isoformat())
            .order("content_date")
            .order("url_hash")
        )

    return _fetch_raw_items_paginated(build_query)


def _issue_slug(issue_date: date, issue_type: str) -> str:
    if issue_type == "weekly":
        return f"{issue_date.isoformat()}-weekly"
    return issue_date.isoformat()


def _issue_title(issue_date: date, issue_type: str) -> str:
    if issue_type == "weekly":
        from .weekly_window import recap_label

        return f"ScoutDNA: All 32, {recap_label(issue_date)}"
    return f"ScoutDNA: All 32, {issue_date.strftime('%B %d, %Y')}"


def fetch_daily_issues_with_sections(issue_dates: list[date]) -> dict[str, dict]:
    """Map issue_date ISO -> { issue row fields, sections: { team_slug -> section } }."""
    if not issue_dates:
        return {}
    sb = get_client()
    iso_dates = [d.isoformat() for d in issue_dates]
    issues_resp = (
        sb.table(ISSUES)
        .select("id, issue_date, slug, league_section, league_footnotes, status")
        .eq("issue_type", "daily")
        .in_("issue_date", iso_dates)
        .execute()
    )
    issues = issues_resp.data or []
    if not issues:
        return {}

    issue_ids = [i["id"] for i in issues]
    teams_resp = sb.table(TEAMS).select("id, slug").execute()
    id_to_slug = {r["id"]: r["slug"] for r in (teams_resp.data or [])}

    sections_resp = (
        sb.table(SECTIONS)
        .select(
            "issue_id, team_id, intro_paragraphs, rookie_paragraph, "
            "activity_markdown, talk_markdown, fantasy_markdown, footnotes, "
            "tags, flags, is_empty, empty_reason"
        )
        .in_("issue_id", issue_ids)
        .execute()
    )

    sections_by_issue: dict[str, dict[str, dict]] = {i["id"]: {} for i in issues}
    for sec in sections_resp.data or []:
        slug = id_to_slug.get(sec.get("team_id"))
        if slug:
            sections_by_issue[sec["issue_id"]][slug] = sec

    out: dict[str, dict] = {}
    for issue in issues:
        iso = issue["issue_date"]
        out[iso] = {
            **issue,
            "sections": sections_by_issue.get(issue["id"], {}),
        }
    return out


def fetch_prior_weekly_context(weekly_issue_date: date, *, max_snippets: int = 6) -> str:
    """Prior weekly edition — avoid repeating last week's recap themes."""
    prev_slug = _issue_slug(weekly_issue_date - timedelta(days=7), "weekly")
    sb = get_client()
    prev = (
        sb.table(ISSUES)
        .select("id, league_section")
        .eq("slug", prev_slug)
        .eq("issue_type", "weekly")
        .limit(1)
        .execute()
    )
    if not prev.data:
        prev = (
            sb.table(ISSUES)
            .select("id, league_section")
            .eq("issue_type", "weekly")
            .lt("issue_date", weekly_issue_date.isoformat())
            .order("issue_date", desc=True)
            .limit(1)
            .execute()
        )
    if not prev.data:
        return ""
    row = prev.data[0]
    parts: list[str] = []
    league = row.get("league_section") or ""
    if league.strip():
        parts.append(f"League: {league[:500]}")
    secs = (
        sb.table(SECTIONS)
        .select("intro_paragraphs")
        .eq("issue_id", row["id"])
        .order("sort_order")
        .limit(12)
        .execute()
    )
    for sec in secs.data or []:
        text = (sec.get("intro_paragraphs") or "").strip()
        if text and len(text) > 40:
            parts.append(text[:280])
        if len(parts) >= max_snippets:
            break
    if not parts:
        return ""
    joined = "\n---\n".join(parts[:max_snippets])
    return (
        "Last week's recap already covered the following. "
        "Do NOT repeat unless daily inputs show a clear NEW development:\n"
        f"{joined}"
    )


def ensure_issue(issue_date: date, issue_type: str = "daily") -> dict:
    sb = get_client()
    slug = _issue_slug(issue_date, issue_type)
    title = _issue_title(issue_date, issue_type)
    existing = (
        sb.table(ISSUES)
        .select("*")
        .eq("issue_date", issue_date.isoformat())
        .eq("issue_type", issue_type)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]
    created = (
        sb.table(ISSUES)
        .insert(
            {
                "issue_date": issue_date.isoformat(),
                "issue_type": issue_type,
                "slug": slug,
                "title": title,
                "status": "collecting",
            }
        )
        .execute()
    )
    return created.data[0]


def mark_issue_collected(issue_date: date, issue_type: str = "daily") -> None:
    """After run_collect: mark collected unless already in review or published."""
    sb = get_client()
    existing = (
        sb.table(ISSUES)
        .select("status")
        .eq("issue_date", issue_date.isoformat())
        .eq("issue_type", issue_type)
        .limit(1)
        .execute()
    )
    if existing.data:
        status = existing.data[0].get("status")
        if status in ("in_review", "published"):
            return
    sb.table(ISSUES).update({"status": "collected"}).eq(
        "issue_date", issue_date.isoformat()
    ).eq("issue_type", issue_type).execute()


def save_sections(issue_id: str, sections: list[dict]) -> None:
    sb = get_client()
    for section in sections:
        sb.table(SECTIONS).upsert(
            {**section, "issue_id": issue_id},
            on_conflict="issue_id,team_id",
        ).execute()
