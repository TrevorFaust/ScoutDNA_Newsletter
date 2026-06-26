"""Upsert fantasy_position_battles from data/fantasy_position_battles_2026.csv."""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path

from .config import ROOT
from .db import get_client

BATTLES_CSV = ROOT / "data" / "fantasy_position_battles_2026.csv"
SEASON = 2026


def sync_fantasy_battles() -> int:
    if not BATTLES_CSV.is_file():
        print(f"Missing {BATTLES_CSV}")
        return 0

    rows: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()
    with BATTLES_CSV.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            team = (row.get("team_abbr") or "").strip().upper()
            pos = (row.get("position") or "").strip().upper()
            slot = (row.get("slot") or "").strip().upper()
            status = (row.get("status") or "").strip().lower()
            raw_candidates = (row.get("candidates") or "").strip()
            note = (row.get("note") or "").strip() or None
            if not team or not pos or not slot or status not in ("settled", "contested", "open"):
                continue
            candidates = [c.strip() for c in raw_candidates.split("|") if c.strip()]
            rows.append(
                {
                    "season": SEASON,
                    "team_abbr": team,
                    "position": pos,
                    "slot": slot,
                    "status": status,
                    "candidates": candidates,
                    "note": note,
                    "updated_at": now,
                }
            )

    if not rows:
        return 0

    sb = get_client()
    sb.table("fantasy_position_battles").delete().eq("season", SEASON).execute()
    n = 0
    for i in range(0, len(rows), 100):
        chunk = rows[i : i + 100]
        sb.table("fantasy_position_battles").upsert(
            chunk, on_conflict="season,team_abbr,position,slot"
        ).execute()
        n += len(chunk)
    return n


def main() -> None:
    print(f"Fantasy position battles: {sync_fantasy_battles()} rows")


if __name__ == "__main__":
    main()
