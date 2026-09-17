"""Download nflverse weekly player stats + snap counts and upsert usage shares.

Falls back to ESPN preseason box scores when nflverse has no PRE rows yet.
"""

from __future__ import annotations

import io
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx
import pyarrow.parquet as pq

from .db import get_client

USAGE_SEASONS = (2025, 2026)
SKILL_POS = {"QB", "RB", "WR", "TE"}
POS_ALIASES = {"FB": "RB", "HB": "RB"}

STATS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_week_{season}.parquet"
)
SNAP_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "snap_counts/snap_counts_{season}.parquet"
)

GAME_TYPE_TO_SEASON = {
    "PRE": "PRE",
    "REG": "REG",
    "WC": "POST",
    "DIV": "POST",
    "CON": "POST",
    "SB": "POST",
    "POST": "POST",
}


# Strip generation / Jr suffixes so "John Metchie III" matches snap "John Metchie".
_SUFFIX_RE = re.compile(
    r"\b(jr|sr|ii|iii|iv|v|vi)\b\.?",
    re.IGNORECASE,
)


def _norm_name(name: str) -> str:
    cleaned = _SUFFIX_RE.sub("", name or "")
    return re.sub(r"[^a-z0-9]", "", cleaned.lower())


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(n):
        return None
    return n


def _int(value: Any) -> int | None:
    n = _num(value)
    if n is None:
        return None
    return int(round(n))


def _pct_points(value: Any) -> float | None:
    n = _num(value)
    if n is None:
        return None
    if n <= 1.5:
        n *= 100
    return round(n, 1)


def _share(part: float | None, whole: float | None) -> float | None:
    if part is None or not whole:
        return None
    return round(100.0 * part / whole, 1)


def _download(url: str) -> bytes | None:
    with httpx.Client(follow_redirects=True, timeout=180) as client:
        resp = client.get(url)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.content


def _norm_pos(raw: str | None) -> str | None:
    pos = (raw or "").upper().strip()
    pos = POS_ALIASES.get(pos, pos)
    return pos if pos in SKILL_POS else None


def _season_type(raw: str | None) -> str:
    key = (raw or "REG").upper().strip()
    return GAME_TYPE_TO_SEASON.get(key, "REG")


def _load_snaps(season: int) -> dict[tuple[str, int, str, str], dict[str, Any]]:
    data = _download(SNAP_URL.format(season=season))
    if not data:
        return {}
    rows = pq.read_table(io.BytesIO(data)).to_pylist()
    out: dict[tuple[str, int, str, str], dict[str, Any]] = {}
    for r in rows:
        week = _int(r.get("week"))
        team = (r.get("team") or "").upper()
        name = r.get("player") or ""
        if week is None or not team or not name:
            continue
        st = _season_type(r.get("game_type") or r.get("season_type"))
        key = (st, week, team, _norm_name(name))
        out[key] = {
            "offense_snaps": _int(r.get("offense_snaps")),
            "snap_pct": _pct_points(r.get("offense_pct")),
        }
    return out


def _stat_rows(season: int) -> list[dict[str, Any]]:
    data = _download(STATS_URL.format(season=season))
    if not data:
        return []
    return pq.read_table(io.BytesIO(data)).to_pylist()


def _build_usage_rows(season: int) -> list[dict[str, Any]]:
    raw = _stat_rows(season)
    if not raw:
        return []
    snaps = _load_snaps(season)
    now = datetime.now(timezone.utc).isoformat()

    parsed: list[dict[str, Any]] = []

    for r in raw:
        gsis = r.get("player_id")
        week = _int(r.get("week"))
        team = (r.get("team") or r.get("recent_team") or "").upper()
        name = (r.get("player_display_name") or r.get("player_name") or "").strip()
        pos = _norm_pos(r.get("position") or r.get("position_group"))
        if not gsis or week is None or not team or not name or not pos:
            continue
        st = _season_type(r.get("season_type"))
        carries = _num(r.get("carries")) or 0.0
        targets = _num(r.get("targets")) or 0.0
        air = _num(r.get("receiving_air_yards")) or 0.0
        snap = snaps.get((st, week, team, _norm_name(name)), {})
        parsed.append(
            {
                "season": season,
                "season_type": st,
                "week": week,
                "team_abbr": team,
                "gsis_id": gsis,
                "player_name": name,
                "position": pos,
                "offense_snaps": snap.get("offense_snaps"),
                "snap_pct": snap.get("snap_pct"),
                "pass_attempts": _int(r.get("attempts")),
                "passing_yards": _int(r.get("passing_yards")),
                "passing_tds": _int(r.get("passing_tds")),
                "interceptions": _int(r.get("passing_interceptions") or r.get("interceptions")),
                "carries": _int(carries),
                "rushing_yards": _int(r.get("rushing_yards")),
                "rushing_tds": _int(r.get("rushing_tds")),
                "targets": _int(targets),
                "receptions": _int(r.get("receptions")),
                "receiving_yards": _int(r.get("receiving_yards")),
                "receiving_tds": _int(r.get("receiving_tds")),
                "receiving_air_yards": _int(air),
                "fantasy_points_ppr": (
                    None
                    if _num(r.get("fantasy_points_ppr")) is None
                    else round(_num(r.get("fantasy_points_ppr")) or 0.0, 1)
                ),
                "updated_at": now,
                "_carries": carries,
                "_targets": targets,
                "_air": air,
            }
        )

    return _finalize_share_rows(parsed)


def _finalize_share_rows(parsed: list[dict[str, Any]]) -> list[dict[str, Any]]:
    team_totals: dict[tuple[str, int, str], dict[str, float]] = defaultdict(
        lambda: {"carries": 0.0, "targets": 0.0, "air": 0.0, "rb_carries": 0.0}
    )
    for row in parsed:
        totals = team_totals[(row["season_type"], row["week"], row["team_abbr"])]
        totals["carries"] += row.get("_carries") or 0.0
        totals["targets"] += row.get("_targets") or 0.0
        totals["air"] += row.get("_air") or 0.0
        if row.get("position") == "RB":
            totals["rb_carries"] += row.get("_carries") or 0.0

    out: list[dict[str, Any]] = []
    for row in parsed:
        totals = team_totals[(row["season_type"], row["week"], row["team_abbr"])]
        carries = row.pop("_carries")
        targets = row.pop("_targets")
        air = row.pop("_air")
        team_carries = totals["carries"]
        team_targets = totals["targets"]
        team_air = totals["air"]
        team_rb = totals["rb_carries"]
        row["rush_share"] = _share(carries, team_carries)
        row["rb_rush_share"] = _share(carries, team_rb) if row["position"] == "RB" else None
        row["target_share"] = _share(targets, team_targets)
        row["air_yards_share"] = _share(air, team_air) if team_air else None
        row["touch_share"] = _share(carries + targets, team_carries + team_targets)
        row["team_carries"] = _int(team_carries)
        row["team_targets"] = _int(team_targets)
        row["team_air_yards"] = _int(team_air) if team_air else None
        out.append(row)
    return out


def _upsert_usage(rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    sb = get_client()
    n = 0
    for i in range(0, len(rows), 400):
        chunk = rows[i : i + 400]
        sb.table("player_week_usage").upsert(
            chunk, on_conflict="season,season_type,week,gsis_id"
        ).execute()
        n += len(chunk)
    return n


def sync_player_usage(seasons: tuple[int, ...] = USAGE_SEASONS) -> dict[str, int]:
    from .sync_espn_usage import build_espn_pre_usage

    counts: dict[str, int] = {}
    for season in seasons:
        rows = _build_usage_rows(season)
        counts[f"{season}_nflverse"] = _upsert_usage(rows)
        has_pre = any(r.get("season_type") == "PRE" for r in rows)
        # 2025 nflverse is REG/POST only; ESPN fill is for the live season until parquet lands.
        if has_pre or season < 2026:
            counts[f"{season}_espn_pre"] = 0
            continue
        print(f"nflverse has no {season} PRE; falling back to ESPN box scores")
        espn_rows = build_espn_pre_usage(season)
        # Drop last run's espn: ids so rematched gsis rows don't duplicate.
        get_client().table("player_week_usage").delete().eq("season", season).eq(
            "season_type", "PRE"
        ).execute()
        counts[f"{season}_espn_pre"] = _upsert_usage(espn_rows)
    return counts
