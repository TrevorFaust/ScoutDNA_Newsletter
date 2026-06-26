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
        "Do NOT repeat unless inputs show a clear NEW development (injury update, new quote, etc.):\n"
        f"{joined}"
    )


def fetch_raw_items_for_date(content_date: date) -> list[dict]:
    sb = get_client()
    resp = (
        sb.table(RAW_ITEMS)
        .select("*")
        .eq("content_date", content_date.isoformat())
        .execute()
    )
    return resp.data or []


def ensure_issue(content_date: date, issue_type: str = "daily") -> dict:
    sb = get_client()
    slug = content_date.isoformat()
    title = f"ScoutDNA: All 32 — {content_date.strftime('%B %d, %Y')}"
    existing = (
        sb.table(ISSUES)
        .select("*")
        .eq("issue_date", content_date.isoformat())
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
                "issue_date": content_date.isoformat(),
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
    """After run_collect: issue exists but has no written sections yet."""
    sb = get_client()
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
