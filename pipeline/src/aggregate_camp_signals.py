"""Aggregate camp_player_signals into rolling camp_slot_scores."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from .camp_signals_common import (
    DEFAULT_WINDOW_DAYS,
    SEASON,
    compute_trend,
    group_duplicate_signals,
    group_representative,
    score_signal_group,
    window_bounds,
)
from .camp_storage import (
    fetch_position_battles,
    fetch_signals_in_window,
    replace_slot_scores,
)


def _score_halves(groups: list[list[dict[str, Any]]], midpoint: date) -> tuple[float, float]:
    """Split deduped story-group scores by which half of the window they fall in,
    using each group's strongest (representative) signal date."""
    first = 0.0
    second = 0.0
    for g in groups:
        rep = group_representative(g)
        w = score_signal_group(g)
        cd = date.fromisoformat(rep["content_date"])
        if cd < midpoint:
            first += w
        else:
            second += w
    return first, second


def aggregate_camp_signals(
    reference_date: date,
    *,
    season: int = SEASON,
    window_days: int = DEFAULT_WINDOW_DAYS,
    team_abbr: str | None = None,
) -> int:
    window_start, window_end = window_bounds(reference_date, window_days)
    signals = fetch_signals_in_window(window_start, window_end, team_abbr=team_abbr)
    battles = fetch_position_battles(season=season, team_abbr=team_abbr)

    # Build candidate keys per slot from current battle map
    slot_candidates: dict[tuple[str, str], list[str]] = {}
    slot_position: dict[tuple[str, str], str] = {}
    for b in battles:
        if b.get("status") not in ("contested", "open", "settled"):
            continue
        key = (b["team_abbr"], b["slot"])
        slot_position[key] = b["position"]
        names = list(b.get("candidates") or [])
        if b.get("status") == "settled" and len(names) == 1:
            slot_candidates[key] = names
        elif b.get("status") in ("contested", "open"):
            slot_candidates[key] = names

    grouped: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for s in signals:
        key = (s["team_abbr"], s["slot"], s["player_name"])
        grouped[key].append(s)

    span_days = (window_end - window_start).days
    mid_date = window_start + timedelta(days=span_days // 2)

    rows: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, str]] = set()

    for (team, slot, player), sigs in grouped.items():
        seen_keys.add((team, slot, player))
        # Collapse republished/duplicate coverage of the same event before
        # scoring — see camp_signals_common.group_duplicate_signals.
        groups = group_duplicate_signals(sigs)
        score = sum(score_signal_group(g) for g in groups)
        up = sum(1 for g in groups if group_representative(g).get("direction") == "up")
        down = sum(1 for g in groups if group_representative(g).get("direction") == "down")
        tiers = [int(s.get("source_tier") or 5) for s in sigs]
        last_at = max(
            (s.get("extracted_at") or s.get("content_date") for s in sigs),
            default=None,
        )
        first_half, second_half = _score_halves(groups, mid_date)
        pos = slot_position.get((team, slot)) or (sigs[0].get("position") if sigs else "WR")
        rows.append(
            {
                "team_abbr": team,
                "position": pos,
                "slot": slot,
                "player_name": player,
                "score": round(score, 2),
                "signal_count": len(groups),
                "up_count": up,
                "down_count": down,
                "last_signal_at": last_at,
                "trend": compute_trend((first_half, second_half)),
                "top_source_tier": min(tiers) if tiers else None,
            }
        )

    # Zero-score rows for battle candidates with no signals (visibility in admin)
    for (team, slot), candidates in slot_candidates.items():
        pos = slot_position.get((team, slot), slot[:2])
        for player in candidates:
            if (team, slot, player) in seen_keys:
                continue
            rows.append(
                {
                    "team_abbr": team,
                    "position": pos,
                    "slot": slot,
                    "player_name": player,
                    "score": 0,
                    "signal_count": 0,
                    "up_count": 0,
                    "down_count": 0,
                    "last_signal_at": None,
                    "trend": "flat",
                    "top_source_tier": None,
                }
            )

    return replace_slot_scores(
        rows,
        season=season,
        window_days=window_days,
        team_abbr=team_abbr,
    )
