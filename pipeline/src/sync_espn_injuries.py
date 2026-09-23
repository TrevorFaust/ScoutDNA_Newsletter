"""Sync current NFL injury board from ESPN's public injuries API.

Source: https://www.espn.com/nfl/injuries
API:    https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries

Stores skill + trench rows; compose filters to fantasy-relevant skill names.
Run before Tuesday weekly compose (see scripts/sync_injuries.ps1).
"""

from __future__ import annotations

import argparse
import re
from datetime import date, datetime, timezone
from typing import Any

import httpx

from .config import TZ
from .db import get_client
from .weekly_window import nfl_week_number

INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries"
HEADERS = {"User-Agent": "ScoutDNA/1.0 (injury sync; pedagogical)"}
TABLE = "player_injury_status"
ESPN_ABBR = {"WSH": "WAS", "AZ": "ARI", "LA": "LAR"}
ATHLETE_ID_RE = re.compile(r"/id/(\d+)/")
PLACEHOLDER_COMMENTS = frozenset(
    {"", "questionable", "out", "doubtful", "probable", "active", "injured reserve"}
)


def _map_team(abbr: str | None) -> str:
    raw = (abbr or "").upper()
    return ESPN_ABBR.get(raw, raw)


def _athlete_id(athlete: dict[str, Any], injury: dict[str, Any]) -> str | None:
    for link in athlete.get("links") or []:
        href = link.get("href") or ""
        m = ATHLETE_ID_RE.search(href)
        if m:
            return m.group(1)
    raw = injury.get("id")
    return str(raw) if raw is not None else None


def _clean_comment(text: str | None) -> str | None:
    t = (text or "").strip()
    if not t or t.lower() in PLACEHOLDER_COMMENTS:
        return None
    return t


def _parse_return_date(details: dict[str, Any] | None) -> str | None:
    if not details:
        return None
    raw = details.get("returnDate")
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10]).isoformat()
    except ValueError:
        return None


def _upcoming_nfl_week(as_of: date) -> int | None:
    """Map sync day to the NFL week the injury board is previewing.

    Tuesday issue dates label the week just finished. The live ESPN board is
    about the next slate (Week N+1 on Tuesday after Week N).
    """
    from datetime import timedelta

    # Nearest Tuesday on or after as_of (Tue=1).
    days_to_tue = (1 - as_of.weekday()) % 7
    issue_tuesday = as_of + timedelta(days=days_to_tue)
    finished = nfl_week_number(issue_tuesday)
    if finished is None:
        return None
    if as_of.weekday() == 1:  # Tuesday: Week N recap day → Week N+1 board
        return finished + 1
    if as_of.weekday() == 0:  # Monday: still inside Week N MNF window
        return finished
    # Wed–Sun: still previewing the week that ends next Monday
    return finished + 1


def fetch_espn_injuries() -> tuple[int, list[dict[str, Any]]]:
    with httpx.Client(timeout=90.0, headers=HEADERS, follow_redirects=True) as client:
        resp = client.get(INJURIES_URL)
        resp.raise_for_status()
        payload = resp.json()
    season = int((payload.get("season") or {}).get("year") or date.today().year)
    rows: list[dict[str, Any]] = []
    as_of = datetime.now(TZ).date()
    week = _upcoming_nfl_week(as_of)
    now = datetime.now(timezone.utc).isoformat()

    for team_block in payload.get("injuries") or []:
        for injury in team_block.get("injuries") or []:
            athlete = injury.get("athlete") or {}
            team = athlete.get("team") or {}
            abbr = _map_team(team.get("abbreviation"))
            if not abbr:
                continue
            aid = _athlete_id(athlete, injury)
            if not aid:
                continue
            pos = ((athlete.get("position") or {}).get("abbreviation") or "").upper()
            details = injury.get("details") or {}
            fantasy = (details.get("fantasyStatus") or {}).get("abbreviation") or (
                (details.get("fantasyStatus") or {}).get("description")
            )
            type_block = injury.get("type") or {}
            status = (
                injury.get("status")
                or type_block.get("description")
                or fantasy
                or "Unknown"
            )
            rows.append(
                {
                    "season": season,
                    "espn_athlete_id": str(aid),
                    "team_abbr": abbr,
                    "player_name": (athlete.get("displayName") or "").strip(),
                    "position": pos or None,
                    "status": str(status).strip().title()
                    if status
                    else "Unknown",
                    "fantasy_status": (str(fantasy).upper() if fantasy else None),
                    "injury_type": details.get("type"),
                    "injury_detail": details.get("detail"),
                    "return_date": _parse_return_date(details),
                    "short_comment": _clean_comment(injury.get("shortComment")),
                    "long_comment": _clean_comment(injury.get("longComment")),
                    "source": "espn",
                    "nfl_week": week,
                    "synced_at": now,
                }
            )
    # Drop empty names
    rows = [r for r in rows if r.get("player_name")]
    return season, rows


def sync_espn_injuries(*, replace_season: bool = True) -> dict[str, int]:
    season, rows = fetch_espn_injuries()
    sb = get_client()
    if replace_season:
        sb.table(TABLE).delete().eq("season", season).eq("source", "espn").execute()
    # Upsert in chunks
    chunk = 200
    written = 0
    for i in range(0, len(rows), chunk):
        batch = rows[i : i + chunk]
        sb.table(TABLE).upsert(batch, on_conflict="season,espn_athlete_id").execute()
        written += len(batch)
    return {"season": season, "rows": written, "nfl_week": rows[0]["nfl_week"] if rows else 0}


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync ESPN NFL injury board")
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Upsert without deleting other season rows first (default replaces ESPN rows for season).",
    )
    args = parser.parse_args()
    stats = sync_espn_injuries(replace_season=not args.keep)
    print(
        f"Synced {stats['rows']} ESPN injury rows "
        f"(season {stats['season']}, preview week {stats['nfl_week']})"
    )


if __name__ == "__main__":
    main()
