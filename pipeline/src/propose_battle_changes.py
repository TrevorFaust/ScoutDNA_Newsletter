"""Propose fantasy_position_battles changes from rolling camp signal momentum.

Pure threshold/scoring logic over already-aggregated camp_slot_scores and raw
camp_player_signals — no LLM calls, so it is free to run every night. This
module never writes to fantasy_position_battles. It only inserts/refreshes
rows in camp_battle_proposals for an editor to approve, reject, or snooze at
/admin/camp-signals.

Each run re-evaluates every battle from scratch: proposals that still qualify
are refreshed in place (same row, updated evidence/rationale), proposals that
no longer qualify are marked expired, and newly-qualifying battles get a new
pending row. This keeps the queue reflecting *current* momentum rather than
relying on a fixed time-based expiry.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from .camp_signals_common import (
    DEFAULT_WINDOW_DAYS,
    SEASON,
    group_duplicate_signals,
    group_representative,
    window_bounds,
)
from .camp_storage import (
    expire_proposal,
    fetch_pending_proposals,
    fetch_position_battles,
    fetch_signals_in_window,
    fetch_slot_scores,
    insert_proposal,
    update_proposal,
    wake_snoozed_proposals,
)

# Thresholds from docs/CAMP_SIGNAL_LAYER.md "Proposal engine".
SETTLE_LEADER_MIN = 8.0
SETTLE_GAP_MIN = 5.0
SETTLE_RIVAL_MAX = 3.0
LEAN_LEADER_MIN = 4.0
LEAN_GAP_MIN = 3.0
NARROW_SCORE_MAX = -4.0
REOPEN_SCORE_MAX = -6.0
EVIDENCE_LIMIT = 5


def _unique_story_groups(signals: list[dict], player: str) -> list[list[dict]]:
    """Deduped stories for one player — republished coverage of the same event
    collapses to a single group so it can't count as multiple confirmations."""
    return group_duplicate_signals([s for s in signals if s.get("player_name") == player])


def _tier_le2_count(signals: list[dict], player: str) -> int:
    groups = _unique_story_groups(signals, player)
    return sum(1 for g in groups if int(group_representative(g).get("source_tier") or 5) <= 2)


def _strength_ge2_count(signals: list[dict], player: str) -> int:
    groups = _unique_story_groups(signals, player)
    return sum(1 for g in groups if int(group_representative(g).get("strength") or 1) >= 2)


def _has_injury_down(signals: list[dict], player: str) -> bool:
    return any(
        s.get("player_name") == player
        and s.get("direction") == "down"
        and s.get("signal_type") == "injury"
        for s in signals
    )


def _evidence_for(signals: list[dict], players: set[str], limit: int = EVIDENCE_LIMIT) -> list[dict]:
    relevant = [s for s in signals if s.get("player_name") in players]
    groups = group_duplicate_signals(relevant)
    groups.sort(
        key=lambda g: (
            group_representative(g).get("content_date") or "",
            len(g),
        ),
        reverse=True,
    )
    out = []
    for g in groups[:limit]:
        rep = group_representative(g)
        out.append(
            {
                "date": rep.get("content_date"),
                "player": rep.get("player_name"),
                "direction": rep.get("direction"),
                "strength": rep.get("strength"),
                "source_tier": rep.get("source_tier"),
                "summary": rep.get("summary"),
                "url": rep.get("source_url"),
                "repeat_count": len(g),
            }
        )
    return out


def _current_state(battle: dict) -> dict[str, Any]:
    return {
        "status": battle.get("status"),
        "candidates": battle.get("candidates"),
        "note": battle.get("note"),
    }


def _evaluate_battle(
    battle: dict, scores: list[dict], signals: list[dict], window_days: int
) -> list[dict[str, Any]]:
    """Return proposal candidates for one (team, slot) battle this run."""
    status = battle.get("status")
    candidates = list(battle.get("candidates") or [])
    proposals: list[dict[str, Any]] = []

    by_player = {s["player_name"]: s for s in scores}
    ranked = sorted(scores, key=lambda s: float(s["score"]), reverse=True)

    if status in ("contested", "open") and ranked:
        leader = ranked[0]
        runner = ranked[1] if len(ranked) > 1 else None
        leader_score = float(leader["score"])
        gap = leader_score - float(runner["score"]) if runner else leader_score
        rivals_capped = all(float(s["score"]) <= SETTLE_RIVAL_MAX for s in ranked[1:])
        strong_evidence = (
            _tier_le2_count(signals, leader["player_name"]) >= 2
            or _strength_ge2_count(signals, leader["player_name"]) >= 4
        )

        if (
            leader_score >= SETTLE_LEADER_MIN
            and gap >= SETTLE_GAP_MIN
            and leader.get("trend") in ("rising", "flat")
            and strong_evidence
            and rivals_capped
        ):
            tier12 = _tier_le2_count(signals, leader["player_name"])
            confidence = "high" if tier12 >= 3 else "medium"
            gap_txt = f"gap +{gap:.1f}" if runner else "no scored rival"
            rationale = (
                f"{leader['player_name']} +{leader_score:.1f} over {window_days}d, {gap_txt}, "
                f"{leader.get('up_count', 0)} up signal(s), {tier12} tier-1/2 source(s)"
            )
            proposals.append(
                {
                    "proposal_type": "settle_slot",
                    "proposed_state": {
                        "status": "settled",
                        "candidates": [leader["player_name"]],
                        "note": (
                            f"Camp signals: {leader['player_name']} solidified "
                            f"{battle['slot']} (pending approval)"
                        ),
                    },
                    "rationale": rationale,
                    "evidence": _evidence_for(signals, {leader["player_name"]}),
                    "confidence": confidence,
                }
            )
        elif runner is not None and leader_score >= LEAN_LEADER_MIN and gap >= LEAN_GAP_MIN:
            reordered = [s["player_name"] for s in ranked if s["player_name"] in candidates]
            reordered += [c for c in candidates if c not in reordered]
            rationale = (
                f"{leader['player_name']} leans ahead: +{leader_score:.1f} vs "
                f"{runner['player_name']} {float(runner['score']):+.1f} (gap +{gap:.1f}) "
                f"over {window_days}d"
            )
            proposals.append(
                {
                    "proposal_type": "strengthen_lean",
                    "proposed_state": {
                        "status": status,
                        "candidates": reordered,
                        "note": f"{leader['player_name']} lean ({leader.get('up_count', 0)}\u2191 signals, {window_days}d)",
                    },
                    "rationale": rationale,
                    "evidence": _evidence_for(
                        signals, {leader["player_name"], runner["player_name"]}
                    ),
                    "confidence": "medium",
                }
            )

        if len(candidates) > 2:
            for c in ranked:
                if (
                    c["player_name"] in candidates
                    and float(c["score"]) <= NARROW_SCORE_MAX
                    and c.get("trend") == "falling"
                ):
                    remaining = [p for p in candidates if p != c["player_name"]]
                    if len(remaining) < 2:
                        continue
                    rationale = (
                        f"{c['player_name']} fading: {float(c['score']):+.1f} over "
                        f"{window_days}d, trend falling"
                    )
                    proposals.append(
                        {
                            "proposal_type": "narrow_battle",
                            "proposed_state": {
                                "status": status,
                                "candidates": remaining,
                                "note": battle.get("note"),
                            },
                            "rationale": rationale,
                            "evidence": _evidence_for(signals, {c["player_name"]}),
                            "confidence": "low",
                        }
                    )

    if status == "settled" and len(candidates) == 1:
        incumbent_name = candidates[0]
        incumbent = by_player.get(incumbent_name)
        if (
            incumbent
            and float(incumbent["score"]) <= REOPEN_SCORE_MAX
            and _has_injury_down(signals, incumbent_name)
        ):
            challengers = sorted(
                (s for s in scores if s["player_name"] != incumbent_name and float(s["score"]) > 0),
                key=lambda s: float(s["score"]),
                reverse=True,
            )
            proposed_candidates = [incumbent_name] + [c["player_name"] for c in challengers[:2]]
            rationale = (
                f"{incumbent_name} regressing: {float(incumbent['score']):+.1f} over "
                f"{window_days}d with a down/injury signal"
            )
            proposals.append(
                {
                    "proposal_type": "reopen_slot",
                    "proposed_state": {
                        "status": "contested",
                        "candidates": proposed_candidates,
                        "note": f"Camp signals: {incumbent_name} regressing, slot reopened for review",
                    },
                    "rationale": rationale,
                    "evidence": _evidence_for(signals, {incumbent_name}),
                    "confidence": "low",
                }
            )

    return proposals


def propose_battle_changes(
    reference_date: date,
    *,
    season: int = SEASON,
    window_days: int = DEFAULT_WINDOW_DAYS,
    team_abbr: str | None = None,
) -> dict[str, int]:
    wake_snoozed_proposals(season=season)

    window_start, window_end = window_bounds(reference_date, window_days)
    battles = fetch_position_battles(season=season, team_abbr=team_abbr)
    scores = fetch_slot_scores(season=season, window_days=window_days, team_abbr=team_abbr)
    signals = fetch_signals_in_window(window_start, window_end, team_abbr=team_abbr)
    pending = fetch_pending_proposals(season=season, team_abbr=team_abbr)

    scores_by_slot: dict[tuple[str, str], list[dict]] = {}
    for s in scores:
        scores_by_slot.setdefault((s["team_abbr"], s["slot"]), []).append(s)

    signals_by_slot: dict[tuple[str, str], list[dict]] = {}
    for s in signals:
        signals_by_slot.setdefault((s["team_abbr"], s["slot"]), []).append(s)

    pending_by_key: dict[tuple[str, str, str, str], dict] = {
        (p["team_abbr"], p["position"], p["slot"], p["proposal_type"]): p for p in pending
    }

    counts = {"proposed": 0, "updated": 0, "expired": 0}
    seen_keys: set[tuple[str, str, str, str]] = set()
    evaluated_slots: set[tuple[str, str]] = set()

    for battle in battles:
        if battle.get("status") not in ("contested", "open", "settled"):
            continue
        slot_key = (battle["team_abbr"], battle["slot"])
        slot_scores = scores_by_slot.get(slot_key, [])
        if not slot_scores:
            continue
        evaluated_slots.add(slot_key)
        slot_signals = signals_by_slot.get(slot_key, [])

        for cp in _evaluate_battle(battle, slot_scores, slot_signals, window_days):
            pkey = (battle["team_abbr"], battle["position"], battle["slot"], cp["proposal_type"])
            seen_keys.add(pkey)
            existing = pending_by_key.get(pkey)
            if existing:
                update_proposal(
                    existing["id"],
                    {
                        "current_state": _current_state(battle),
                        "proposed_state": cp["proposed_state"],
                        "rationale": cp["rationale"],
                        "evidence": cp["evidence"],
                        "confidence": cp["confidence"],
                    },
                )
                counts["updated"] += 1
            else:
                insert_proposal(
                    {
                        "season": season,
                        "team_abbr": battle["team_abbr"],
                        "position": battle["position"],
                        "slot": battle["slot"],
                        "proposal_type": cp["proposal_type"],
                        "current_state": _current_state(battle),
                        "proposed_state": cp["proposed_state"],
                        "rationale": cp["rationale"],
                        "evidence": cp["evidence"],
                        "confidence": cp["confidence"],
                    }
                )
                counts["proposed"] += 1

    # Pending proposals for slots we re-scored this run but that no longer
    # qualify (momentum reversed, gap closed, etc.) get expired. Proposals for
    # slots we couldn't score this run are left untouched.
    for pkey, existing in pending_by_key.items():
        team_abbr_key, _position, slot_key_val, _ptype = pkey
        if (team_abbr_key, slot_key_val) in evaluated_slots and pkey not in seen_keys:
            expire_proposal(existing["id"])
            counts["expired"] += 1

    return counts


def main() -> None:
    import argparse
    from datetime import datetime

    from .config import TZ

    parser = argparse.ArgumentParser(description="Propose battle changes from camp signals")
    parser.add_argument("--date", type=str, help="Reference date YYYY-MM-DD (default: today)")
    parser.add_argument("--team", type=str, help="Team abbrev only, e.g. BAL")
    parser.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS)
    args = parser.parse_args()

    reference = date.fromisoformat(args.date) if args.date else datetime.now(TZ).date()
    counts = propose_battle_changes(
        reference,
        window_days=args.window_days,
        team_abbr=args.team.upper() if args.team else None,
    )
    print(
        f"Proposals: {counts['proposed']} new, {counts['updated']} updated, "
        f"{counts['expired']} expired"
    )


if __name__ == "__main__":
    main()
