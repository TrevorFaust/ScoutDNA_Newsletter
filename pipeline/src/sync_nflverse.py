"""Download nflverse parquet files and upsert into Supabase."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pyarrow.parquet as pq

from .config import ROOT
from .db import get_client

ROSTER_URL = "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.parquet"
DEPTH_URL = "https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_2026.parquet"
DRAFT_PICKS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.parquet"
)
DRAFT_SEASON = 2026
COACHING_CSV = ROOT / "data" / "coaching_2026.csv"
TEAMS_JSON = ROOT / "data" / "teams.json"


def _download(url: str) -> bytes:
    with httpx.Client(follow_redirects=True, timeout=180) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.content


def _team_name_to_abbr() -> dict[str, str]:
    raw = json.loads(TEAMS_JSON.read_text(encoding="utf-8"))
    return {row["name"]: row["abbrev"].upper() for row in raw}


def sync_rosters() -> int:
    data = _download(ROSTER_URL)
    table = pq.read_table(io.BytesIO(data))
    rows = table.to_pylist()
    sb = get_client()
    batch: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()
    for r in rows:
        gsis = r.get("gsis_id")
        if not gsis:
            continue
        batch.append(
            {
                "gsis_id": gsis,
                "team_abbr": r.get("team"),
                "full_name": r.get("full_name"),
                "position": r.get("position"),
                "depth_chart_position": r.get("depth_chart_position"),
                "jersey_number": r.get("jersey_number"),
                "status": r.get("status"),
                "years_exp": r.get("years_exp"),
                "college": r.get("college"),
                "rookie_year": r.get("rookie_year"),
                "updated_at": now,
            }
        )
    n = 0
    for i in range(0, len(batch), 500):
        chunk = batch[i : i + 500]
        sb.table("rosters_2026").upsert(chunk, on_conflict="gsis_id").execute()
        n += len(chunk)
    return n


def sync_depth_charts() -> int:
    data = _download(DEPTH_URL)
    table = pq.read_table(io.BytesIO(data))
    rows = table.to_pylist()
    if not rows:
        return 0
    latest_dt = max(r.get("dt") or "" for r in rows)
    rows = [r for r in rows if r.get("dt") == latest_dt]
    sb = get_client()
    sb.table("depth_charts_2026").delete().neq("team_abbr", "").execute()
    batch: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()
    for r in rows:
        player_name = r.get("player_name")
        if not player_name:
            continue
        batch.append(
            {
                "team_abbr": r.get("team"),
                "player_name": player_name,
                "gsis_id": r.get("gsis_id"),
                "pos_abb": r.get("pos_abb"),
                "pos_name": r.get("pos_name"),
                "pos_grp": r.get("pos_grp"),
                "pos_slot": r.get("pos_slot"),
                "pos_rank": r.get("pos_rank"),
                "snapshot_dt": r.get("dt") or now,
                "updated_at": now,
            }
        )
    n = 0
    for i in range(0, len(batch), 500):
        chunk = batch[i : i + 500]
        sb.table("depth_charts_2026").upsert(
            chunk, on_conflict="team_abbr,gsis_id,pos_abb,pos_slot"
        ).execute()
        n += len(chunk)
    return n


def _parse_since(raw: str) -> int | None:
    if not raw or raw.strip() in ("--", ""):
        return None
    m = re.match(r"(\d+)", raw.strip())
    return int(m.group(1)) if m else None


def sync_draft_picks() -> int:
    data = _download(DRAFT_PICKS_URL)
    table = pq.read_table(io.BytesIO(data))
    rows = table.to_pylist()
    sb = get_client()
    picks = [r for r in rows if r.get("season") == DRAFT_SEASON and r.get("team")]
    sb.table("draft_picks_2026").delete().eq("season", DRAFT_SEASON).execute()
    batch: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()
    for r in picks:
        overall = r.get("pick")
        rnd = r.get("round")
        name = (r.get("pfr_player_name") or "").strip()
        team = r.get("team")
        if overall is None or rnd is None or not name or not team:
            continue
        batch.append(
            {
                "season": DRAFT_SEASON,
                "team_abbr": team,
                "round": rnd,
                "overall_pick": overall,
                "player_name": name,
                "position": r.get("position"),
                "gsis_id": r.get("gsis_id"),
                "college": r.get("college"),
                "updated_at": now,
            }
        )
    n = 0
    for i in range(0, len(batch), 500):
        chunk = batch[i : i + 500]
        sb.table("draft_picks_2026").upsert(chunk, on_conflict="season,overall_pick").execute()
        n += len(chunk)
    return n


def sync_coaching() -> int:
    if not COACHING_CSV.is_file():
        print(f"Missing {COACHING_CSV}")
        return 0
    name_to_abbr = _team_name_to_abbr()
    sb = get_client()
    rows: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()
    with COACHING_CSV.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            team_name = (row.get("TEAM") or "").strip()
            if not team_name:
                continue
            abbr = name_to_abbr.get(team_name)
            if not abbr:
                print(f"  skip unknown team: {team_name}")
                continue
            dc_name = re.sub(r"\[.*?\]", "", (row.get("DC") or "").strip()).strip()
            rows.append(
                {
                    "team_abbr": abbr,
                    "team_name": team_name,
                    "hc_name": (row.get("HC") or "").strip() or None,
                    "hc_exp": _parse_since(row.get("HC Exp") or ""),
                    "hc_record_2025": (row.get("HC 2025 RECORD") or "").strip() or None,
                    "oc_name": (row.get("OC") or "").strip() or None,
                    "oc_since": _parse_since(row.get("OC Since") or ""),
                    "oc_previous_role": (row.get("OC Previous Role") or "").strip() or None,
                    "dc_name": dc_name or None,
                    "dc_since": _parse_since(row.get("DC Since ") or row.get("DC Since") or ""),
                    "dc_previous_role": (row.get("DC Previous Role") or "").strip() or None,
                    "gm_name": (row.get("General Manager") or "").strip() or None,
                    "updated_at": now,
                }
            )
    if rows:
        sb.table("team_coaching_2026").upsert(rows, on_conflict="team_abbr").execute()
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync nflverse + coaching to Supabase")
    parser.add_argument("--rosters-only", action="store_true")
    parser.add_argument("--depth-only", action="store_true")
    parser.add_argument("--coaching-only", action="store_true")
    parser.add_argument("--draft-only", action="store_true")
    args = parser.parse_args()
    all_default = not (
        args.rosters_only or args.depth_only or args.coaching_only or args.draft_only
    )

    if all_default or args.coaching_only:
        print(f"Coaching: {sync_coaching()} teams")
    if all_default or args.rosters_only:
        print(f"Rosters: {sync_rosters()} rows")
    if all_default or args.depth_only:
        print(f"Depth charts: {sync_depth_charts()} rows")
    if all_default or args.draft_only:
        print(f"Draft picks: {sync_draft_picks()} rows")


if __name__ == "__main__":
    main()
