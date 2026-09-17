"""ESPN box-score fallback when nflverse has no preseason player stats."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from .db import get_client
from .sync_player_usage import (
    POS_ALIASES,
    SKILL_POS,
    _finalize_share_rows,
    _int,
    _norm_name,
)

SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary"
HEADERS = {"User-Agent": "ScoutDNA/1.0 (usage sync; pedagogical)"}

# ESPN preseason calendar: 1=HOF, 2=Week 1, 3=Week 2, 4=Week 3
PRE_CALENDAR_WEEKS = (1, 2, 3, 4)
# Store newsletter/nflverse codes so compose can find the rows (LAR, not LA).
ESPN_ABBR = {"WSH": "WAS", "AZ": "ARI", "LA": "LAR"}


def _map_team(abbr: str | None) -> str:
    raw = (abbr or "").upper()
    return ESPN_ABBR.get(raw, raw)


def _slash_attempts(value: Any) -> int | None:
    text = str(value or "")
    if "/" not in text:
        return _int(value)
    right = text.split("/", 1)[1]
    return _int(right.split("-")[0] if "-" in right else right)


def _ppr(
    *,
    pass_yd: float,
    pass_td: float,
    ints: float,
    rush_yd: float,
    rush_td: float,
    rec: float,
    rec_yd: float,
    rec_td: float,
) -> float:
    return round(
        pass_yd / 25.0
        + pass_td * 4.0
        - ints * 2.0
        + rush_yd / 10.0
        + rush_td * 6.0
        + rec
        + rec_yd / 10.0
        + rec_td * 6.0,
        1,
    )


def _infer_pos(has_pass: bool, carries: float, targets: float, roster_pos: str | None) -> str | None:
    if roster_pos:
        mapped = POS_ALIASES.get(roster_pos, roster_pos)
        if mapped in SKILL_POS:
            return mapped
    if has_pass:
        return "QB"
    if carries >= 3 and carries >= targets:
        return "RB"
    if targets >= 1:
        return "WR"
    if carries >= 1:
        return "RB"
    return None


def _roster_index() -> dict[tuple[str, str], dict[str, Any]]:
    sb = get_client()
    rows: list[dict[str, Any]] = []
    start = 0
    page = 1000
    try:
        while True:
            resp = (
                sb.table("rosters_2026")
                .select("gsis_id, full_name, team_abbr, position")
                .range(start, start + page - 1)
                .execute()
            )
            batch = resp.data or []
            rows.extend(batch)
            if len(batch) < page:
                break
            start += page
    except Exception:
        return {}
    out: dict[tuple[str, str], dict[str, Any]] = {}
    for r in rows:
        name = _norm_name(r.get("full_name") or "")
        team = (r.get("team_abbr") or "").upper()
        if not name or not team:
            continue
        out[(team, name)] = {
            "gsis_id": r.get("gsis_id"),
            "position": (r.get("position") or "").upper(),
            "full_name": r.get("full_name"),
        }
    print(f"roster index {len(out)} names from {len(rows)} rows")
    return out


def _parse_group(group: dict[str, Any]) -> dict[str, dict[str, str]]:
    keys = group.get("keys") or []
    by_id: dict[str, dict[str, str]] = {}
    for ath in group.get("athletes") or []:
        athlete = ath.get("athlete") or {}
        aid = str(athlete.get("id") or "")
        if not aid:
            continue
        by_id[aid] = {
            "_name": athlete.get("displayName") or "",
            **dict(zip(keys, ath.get("stats") or [])),
        }
    return by_id


def _merge_box_players(team_block: dict[str, Any]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for group in team_block.get("statistics") or []:
        name = group.get("name")
        if name not in ("passing", "rushing", "receiving"):
            continue
        for aid, stats in _parse_group(group).items():
            row = grouped.setdefault(aid, {"athlete_id": aid, "display_name": stats.get("_name")})
            if stats.get("_name"):
                row["display_name"] = stats["_name"]
            if name == "passing":
                row["pass_attempts"] = _slash_attempts(stats.get("completions/passingAttempts"))
                row["passing_yards"] = _int(stats.get("passingYards"))
                row["passing_tds"] = _int(stats.get("passingTouchdowns"))
                row["interceptions"] = _int(stats.get("interceptions"))
            elif name == "rushing":
                row["carries"] = _int(stats.get("rushingAttempts"))
                row["rushing_yards"] = _int(stats.get("rushingYards"))
                row["rushing_tds"] = _int(stats.get("rushingTouchdowns"))
            elif name == "receiving":
                row["receptions"] = _int(stats.get("receptions"))
                row["receiving_yards"] = _int(stats.get("receivingYards"))
                row["receiving_tds"] = _int(stats.get("receivingTouchdowns"))
                row["targets"] = _int(stats.get("receivingTargets"))
    return list(grouped.values())


def _list_final_pre_events(client: httpx.Client, season: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    seen: set[str] = set()
    for cal_week in PRE_CALENDAR_WEEKS:
        resp = client.get(
            SCOREBOARD_URL,
            params={"seasontype": 1, "dates": str(season), "week": cal_week, "limit": 100},
        )
        resp.raise_for_status()
        payload = resp.json()
        for event in payload.get("events") or []:
            eid = str(event.get("id") or "")
            status = ((event.get("status") or {}).get("type") or {}).get("name")
            if not eid or eid in seen or status != "STATUS_FINAL":
                continue
            seen.add(eid)
            espn_week = _int((event.get("week") or {}).get("number") or cal_week) or cal_week
            events.append(
                {
                    "id": eid,
                    # Hall of Fame = 0, Preseason Week 1 = 1, ...
                    "week": max(espn_week - 1, 0),
                }
            )
    print(f"ESPN {season} PRE: {len(events)} final games")
    return events


def build_espn_pre_usage(season: int) -> list[dict[str, Any]]:
    roster = _roster_index()
    now = datetime.now(timezone.utc).isoformat()
    parsed: list[dict[str, Any]] = []
    with httpx.Client(follow_redirects=True, timeout=45, headers=HEADERS) as client:
        events = _list_final_pre_events(client, season)
        for i, event in enumerate(events, start=1):
            if i == 1 or i % 8 == 0 or i == len(events):
                print(f"  box {i}/{len(events)}")
            resp = client.get(SUMMARY_URL, params={"event": event["id"]})
            if resp.status_code != 200:
                print(f"  skip event {event['id']} ({resp.status_code})")
                continue
            box_teams = ((resp.json().get("boxscore") or {}).get("players")) or []
            for team_block in box_teams:
                team = _map_team((team_block.get("team") or {}).get("abbreviation"))
                if not team:
                    continue
                for raw in _merge_box_players(team_block):
                    name = (raw.get("display_name") or "").strip()
                    if not name:
                        continue
                    meta = roster.get((team, _norm_name(name)), {})
                    pass_att = raw.get("pass_attempts") or 0
                    carries = float(raw.get("carries") or 0)
                    targets = float(raw.get("targets") or 0)
                    pos = _infer_pos(pass_att > 0, carries, targets, meta.get("position"))
                    if not pos:
                        continue
                    rec = float(raw.get("receptions") or 0)
                    rec_yd = float(raw.get("receiving_yards") or 0)
                    rec_td = float(raw.get("receiving_tds") or 0)
                    rush_yd = float(raw.get("rushing_yards") or 0)
                    rush_td = float(raw.get("rushing_tds") or 0)
                    pass_yd = float(raw.get("passing_yards") or 0)
                    pass_td = float(raw.get("passing_tds") or 0)
                    ints = float(raw.get("interceptions") or 0)
                    gsis = meta.get("gsis_id") or f"espn:{raw['athlete_id']}"
                    parsed.append(
                        {
                            "season": season,
                            "season_type": "PRE",
                            "week": event["week"],
                            "team_abbr": team,
                            "gsis_id": gsis,
                            "player_name": meta.get("full_name") or name,
                            "position": pos,
                            "offense_snaps": None,
                            "snap_pct": None,
                            "pass_attempts": raw.get("pass_attempts"),
                            "passing_yards": raw.get("passing_yards"),
                            "passing_tds": raw.get("passing_tds"),
                            "interceptions": raw.get("interceptions"),
                            "carries": raw.get("carries") or 0,
                            "rushing_yards": raw.get("rushing_yards"),
                            "rushing_tds": raw.get("rushing_tds"),
                            "targets": raw.get("targets") or 0,
                            "receptions": raw.get("receptions") or 0,
                            "receiving_yards": raw.get("receiving_yards"),
                            "receiving_tds": raw.get("receiving_tds"),
                            "receiving_air_yards": None,
                            "fantasy_points_ppr": _ppr(
                                pass_yd=pass_yd,
                                pass_td=pass_td,
                                ints=ints,
                                rush_yd=rush_yd,
                                rush_td=rush_td,
                                rec=rec,
                                rec_yd=rec_yd,
                                rec_td=rec_td,
                            ),
                            "updated_at": now,
                            "_carries": carries,
                            "_targets": targets,
                            "_air": 0.0,
                        }
                    )
    return _finalize_share_rows(parsed)
