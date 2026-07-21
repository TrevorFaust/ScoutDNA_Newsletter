"""Supabase I/O for camp signal tables."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from .camp_signals_common import SEASON
from .db import get_client
from .tables import (
    CAMP_BATTLE_PROPOSALS,
    CAMP_PLAYER_SIGNALS,
    CAMP_SLOT_SCORES,
    FANTASY_POSITION_BATTLES,
)


def fetch_position_battles(
    *, season: int = SEASON, team_abbr: str | None = None
) -> list[dict[str, Any]]:
    sb = get_client()
    q = (
        sb.table(FANTASY_POSITION_BATTLES)
        .select("team_abbr, position, slot, status, candidates, note")
        .eq("season", season)
    )
    if team_abbr:
        q = q.eq("team_abbr", team_abbr.upper())
    resp = q.order("team_abbr").order("position").order("slot").execute()
    return resp.data or []


def fetch_processed_raw_item_ids(raw_item_ids: list[str]) -> set[str]:
    if not raw_item_ids:
        return set()
    sb = get_client()
    found: set[str] = set()
    for i in range(0, len(raw_item_ids), 100):
        chunk = raw_item_ids[i : i + 100]
        resp = (
            sb.table(CAMP_PLAYER_SIGNALS)
            .select("raw_item_id")
            .in_("raw_item_id", chunk)
            .execute()
        )
        for row in resp.data or []:
            found.add(row["raw_item_id"])
    return found


def upsert_camp_signals(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    sb = get_client()
    n = 0
    for i in range(0, len(rows), 50):
        chunk = rows[i : i + 50]
        sb.table(CAMP_PLAYER_SIGNALS).upsert(
            chunk, on_conflict="raw_item_id,player_name,slot"
        ).execute()
        n += len(chunk)
    return n


def fetch_signals_in_window(
    window_start: date,
    window_end: date,
    *,
    team_abbr: str | None = None,
) -> list[dict[str, Any]]:
    sb = get_client()
    q = (
        sb.table(CAMP_PLAYER_SIGNALS)
        .select("*")
        .gte("content_date", window_start.isoformat())
        .lte("content_date", window_end.isoformat())
    )
    if team_abbr:
        q = q.eq("team_abbr", team_abbr.upper())
    resp = q.execute()
    return resp.data or []


def replace_slot_scores(
    rows: list[dict[str, Any]],
    *,
    season: int = SEASON,
    window_days: int,
    team_abbr: str | None = None,
) -> int:
    sb = get_client()
    del_q = sb.table(CAMP_SLOT_SCORES).delete().eq("season", season).eq(
        "window_days", window_days
    )
    if team_abbr:
        del_q = del_q.eq("team_abbr", team_abbr.upper())
    del_q.execute()
    if not rows:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    for row in rows:
        row.setdefault("season", season)
        row.setdefault("window_days", window_days)
        row["updated_at"] = now
    n = 0
    for i in range(0, len(rows), 100):
        chunk = rows[i : i + 100]
        sb.table(CAMP_SLOT_SCORES).upsert(chunk).execute()
        n += len(chunk)
    return n


def fetch_slot_scores(
    *,
    season: int = SEASON,
    window_days: int = 7,
    team_abbr: str | None = None,
    min_abs_score: float | None = None,
) -> list[dict[str, Any]]:
    sb = get_client()
    q = (
        sb.table(CAMP_SLOT_SCORES)
        .select("*")
        .eq("season", season)
        .eq("window_days", window_days)
    )
    if team_abbr:
        q = q.eq("team_abbr", team_abbr.upper())
    resp = q.order("team_abbr").order("slot").order("score", desc=True).execute()
    rows = resp.data or []
    if min_abs_score is not None:
        rows = [r for r in rows if abs(float(r.get("score") or 0)) >= min_abs_score]
    return rows


def fetch_recent_signals(
    *,
    days: int = 7,
    team_abbr: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    sb = get_client()
    q = sb.table(CAMP_PLAYER_SIGNALS).select("*")
    if team_abbr:
        q = q.eq("team_abbr", team_abbr.upper())
    resp = q.order("content_date", desc=True).order("extracted_at", desc=True).limit(limit).execute()
    return resp.data or []


def fetch_pending_proposals(
    *, season: int = SEASON, team_abbr: str | None = None
) -> list[dict[str, Any]]:
    sb = get_client()
    q = (
        sb.table(CAMP_BATTLE_PROPOSALS)
        .select("*")
        .eq("season", season)
        .eq("status", "pending")
    )
    if team_abbr:
        q = q.eq("team_abbr", team_abbr.upper())
    resp = q.execute()
    return resp.data or []


def wake_snoozed_proposals(*, season: int = SEASON) -> int:
    """Flip snoozed proposals whose snooze_until has passed back to pending."""
    sb = get_client()
    now = datetime.now(timezone.utc).isoformat()
    resp = (
        sb.table(CAMP_BATTLE_PROPOSALS)
        .update({"status": "pending"})
        .eq("season", season)
        .eq("status", "snoozed")
        .lte("snooze_until", now)
        .execute()
    )
    return len(resp.data or [])


def insert_proposal(row: dict[str, Any]) -> dict[str, Any]:
    sb = get_client()
    row.setdefault("status", "pending")
    resp = sb.table(CAMP_BATTLE_PROPOSALS).insert(row).execute()
    return (resp.data or [{}])[0]


def update_proposal(proposal_id: str, fields: dict[str, Any]) -> None:
    sb = get_client()
    sb.table(CAMP_BATTLE_PROPOSALS).update(fields).eq("id", proposal_id).execute()


def expire_proposal(proposal_id: str) -> None:
    sb = get_client()
    sb.table(CAMP_BATTLE_PROPOSALS).update(
        {"status": "expired", "resolved_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", proposal_id).execute()
