"""Sync nflverse schedules + team-week stats into team_week_results."""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any

import httpx
import pyarrow.parquet as pq

from .db import get_client
from .sync_player_usage import GAME_TYPE_TO_SEASON, USAGE_SEASONS, _int, _num

SCHEDULES_URLS = (
    "https://github.com/nflverse/nflverse-data/releases/download/schedules/schedules.parquet",
    "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.parquet",
)
TEAM_STATS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_team/stats_team_week_{season}.parquet"
)


def _download(url: str) -> bytes | None:
    with httpx.Client(follow_redirects=True, timeout=180) as client:
        resp = client.get(url)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.content


def _season_type(raw: str | None) -> str:
    key = (raw or "REG").upper().strip()
    return GAME_TYPE_TO_SEASON.get(key, "REG")


def _gameday(raw: Any) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    return text[:10]


def _load_schedules(seasons: tuple[int, ...]) -> list[dict[str, Any]]:
    data = None
    for url in SCHEDULES_URLS:
        data = _download(url)
        if data:
            break
    if not data:
        return []
    rows = pq.read_table(io.BytesIO(data)).to_pylist()
    wanted = set(seasons)
    out: list[dict[str, Any]] = []
    for r in rows:
        season = _int(r.get("season"))
        if season not in wanted:
            continue
        week = _int(r.get("week"))
        home = (r.get("home_team") or "").upper()
        away = (r.get("away_team") or "").upper()
        if week is None or not home or not away:
            continue
        out.append(
            {
                "season": season,
                "season_type": _season_type(r.get("game_type") or r.get("season_type")),
                "week": week,
                "gameday": _gameday(r.get("gameday") or r.get("gamedate")),
                "home_team": home,
                "away_team": away,
                "home_score": _int(r.get("home_score")),
                "away_score": _int(r.get("away_score")),
            }
        )
    return out


def _load_team_offense(season: int) -> dict[tuple[str, int, str], dict[str, int]]:
    data = _download(TEAM_STATS_URL.format(season=season))
    if not data:
        return {}
    rows = pq.read_table(io.BytesIO(data)).to_pylist()
    out: dict[tuple[str, int, str], dict[str, int]] = {}
    for r in rows:
        week = _int(r.get("week"))
        team = (r.get("team") or r.get("recent_team") or "").upper()
        if week is None or not team:
            continue
        st = _season_type(r.get("season_type") or r.get("game_type"))
        ints = _int(r.get("interceptions") or r.get("passing_interceptions")) or 0
        fumbles = _int(r.get("sack_fumbles_lost") or r.get("rushing_fumbles_lost")) or 0
        extra_fumbles = _int(r.get("rushing_fumbles_lost")) or 0
        if r.get("sack_fumbles_lost") is not None and r.get("rushing_fumbles_lost") is not None:
            fumbles = (_int(r.get("sack_fumbles_lost")) or 0) + extra_fumbles
        out[(st, week, team)] = {
            "pass_yd": _int(r.get("passing_yards")) or 0,
            "rush_yd": _int(r.get("rushing_yards")) or 0,
            "turnovers": ints + fumbles,
        }
    return out


def _result(pf: int | None, pa: int | None) -> str | None:
    if pf is None or pa is None:
        return None
    if pf > pa:
        return "W"
    if pf < pa:
        return "L"
    return "T"


def sync_team_week_results(seasons: tuple[int, ...] = USAGE_SEASONS) -> int:
    schedules = _load_schedules(seasons)
    if not schedules:
        return 0
    offense_by_season = {season: _load_team_offense(season) for season in seasons}
    now = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []

    def add_side(
        *,
        season: int,
        season_type: str,
        week: int,
        team: str,
        opponent: str,
        pf: int | None,
        pa: int | None,
        home: bool,
        gameday: Any,
    ) -> None:
        opp_off = offense_by_season.get(season, {}).get((season_type, week, opponent), {})
        pass_allowed = opp_off.get("pass_yd")
        rush_allowed = opp_off.get("rush_yd")
        yards_allowed = None
        if pass_allowed is not None or rush_allowed is not None:
            yards_allowed = (pass_allowed or 0) + (rush_allowed or 0)
        rows.append(
            {
                "season": season,
                "season_type": season_type,
                "week": week,
                "team_abbr": team,
                "opponent_abbr": opponent,
                "gameday": gameday,
                "home": home,
                "points_for": pf,
                "points_against": pa,
                "result": _result(pf, pa),
                "yards_allowed": yards_allowed,
                "passing_yards_allowed": pass_allowed,
                "rushing_yards_allowed": rush_allowed,
                "turnovers_forced": opp_off.get("turnovers"),
                "updated_at": now,
            }
        )

    for g in schedules:
        add_side(
            season=g["season"],
            season_type=g["season_type"],
            week=g["week"],
            team=g["home_team"],
            opponent=g["away_team"],
            pf=g["home_score"],
            pa=g["away_score"],
            home=True,
            gameday=g["gameday"],
        )
        add_side(
            season=g["season"],
            season_type=g["season_type"],
            week=g["week"],
            team=g["away_team"],
            opponent=g["home_team"],
            pf=g["away_score"],
            pa=g["home_score"],
            home=False,
            gameday=g["gameday"],
        )

    if not rows:
        return 0
    sb = get_client()
    n = 0
    for i in range(0, len(rows), 400):
        chunk = rows[i : i + 400]
        sb.table("team_week_results").upsert(
            chunk, on_conflict="season,season_type,week,team_abbr"
        ).execute()
        n += len(chunk)
    return n
