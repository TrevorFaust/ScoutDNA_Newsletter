"""Extract directional camp signals for position-battle candidates from raw items."""

from __future__ import annotations

import json
import os
from datetime import date
from typing import Any

import anthropic

from .camp_signals_common import (
    EXTRACT_MODEL,
    is_camp_relevant,
    mentions_any_candidate,
    norm_name,
)
from .camp_storage import fetch_position_battles, fetch_processed_raw_item_ids, upsert_camp_signals
from .compose_json import parse_compose_json
from .storage import fetch_raw_items_for_date, fetch_team_id_map

MAX_ITEMS_PER_TEAM = 12
MAX_BODY_CHARS = 2400

EXTRACT_PROMPT = """You extract camp/depth-chart momentum signals for NFL position battles.

Rules:
- Only emit signals for players listed in battles[].candidates.
- direction: up (gaining ground IN THE BATTLE), down (losing ground/setback), neutral (mentioned without clear direction).
- strength 2-3 requires content that speaks DIRECTLY to the battle outcome: first-team/starter reps, snap counts,
  depth-chart order, a coach naming a starter or leader, or explicitly beating out a named rival. General offseason
  hype, conditioning/fitness praise, "looks improved," or vague optimism with no rep/depth-chart detail is strength 1
  at most, even from a great source and even if a coach said it. Being praised is not the same as winning reps.
- PREDICTIONS ARE NOT EVIDENCE: a pundit/analyst/podcast PROJECTING or PREDICTING who will win a battle
  ("likely leader," "favorite to start," "poised to emerge," "primed to win the job") is speculation about the
  future, not a report of something that already happened — tag these signal_type: "projection" regardless of
  how the outlet frames it (even if written like a beat report), and always use strength 1 for them. Speculation
  going into minicamp is fine to track, it just isn't strong evidence — many people guessing the same outcome
  before camp starts is not the same as camp reps actually being observed. Only use camp_rep/coach_quote/
  beat_report/practice_snap when the item reports something that ALREADY HAPPENED at a practice, workout, or in
  a coach's stated decision.
- strength: 1 = passing mention, generic hype, or any projection/prediction (always strength 1, never higher),
  2 = clear battle-specific lean from something that already happened (reps/depth chart/coach naming a leader),
  3 = standout or major setback with strong battle-specific evidence (named the starter, lost reps to injury,
  clearly separated from the field in practice).
- signal_type: camp_rep, coach_quote, beat_report, practice_snap, injury, rumor, projection.
- Reddit/fan sources: max strength 2 unless multiple concrete practice details.
- Skip generic team camp recaps with no player-specific direction.
- Skip pure hype/conditioning pieces with no depth-chart signal entirely rather than force a direction.
- Match slot labels exactly from battles (WR2, RB1, etc.).

Return ONLY JSON:
{"signals":[{"raw_item_id":"uuid","player_name":"Name","slot":"WR2","direction":"up","strength":2,"signal_type":"beat_report","summary":"One sentence."}]}

If nothing qualifies, return {"signals":[]}."""


def _battles_for_team(battles: list[dict], team_abbr: str) -> list[dict]:
    out = []
    for b in battles:
        if b.get("team_abbr") != team_abbr:
            continue
        if b.get("status") not in ("contested", "open"):
            continue
        candidates = b.get("candidates") or []
        if not candidates:
            continue
        out.append(
            {
                "slot": b["slot"],
                "status": b["status"],
                "position": b["position"],
                "candidates": candidates,
                "note": b.get("note"),
            }
        )
    return out


def _candidate_pool(battles: list[dict]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for b in battles:
        for c in b.get("candidates") or []:
            key = norm_name(c)
            if key and key not in seen:
                seen.add(key)
                names.append(c)
    return names


def _filter_items_for_team(
    items: list[dict],
    team_slug: str,
    slug_to_id: dict[str, str],
    candidates: list[str],
    processed_ids: set[str],
) -> list[dict]:
    team_id = slug_to_id.get(team_slug)
    if not team_id:
        return []
    out: list[dict] = []
    for item in items:
        rid = item.get("id")
        if not rid or rid in processed_ids:
            continue
        team_ids = item.get("team_ids") or []
        if team_id not in team_ids:
            continue
        text = f"{item.get('title') or ''}\n{item.get('body') or ''}"
        if not is_camp_relevant(text) and not mentions_any_candidate(text, candidates):
            continue
        if not mentions_any_candidate(text, candidates):
            continue
        out.append(item)
    return out[:MAX_ITEMS_PER_TEAM]


def _build_user_payload(team_abbr: str, battles: list[dict], items: list[dict]) -> str:
    payload = {
        "team_abbr": team_abbr,
        "battles": battles,
        "items": [
            {
                "id": i["id"],
                "title": (i.get("title") or "")[:300],
                "body": (i.get("body") or "")[:MAX_BODY_CHARS],
                "source_tier": i.get("source_tier", 3),
                "url": i.get("url"),
            }
            for i in items
        ],
    }
    return EXTRACT_PROMPT + "\n\nInput:\n" + json.dumps(payload, indent=2)


def _parse_signals(
    text: str,
    *,
    team_abbr: str,
    content_date: date,
    items_by_id: dict[str, dict],
    battles: list[dict],
) -> list[dict[str, Any]]:
    try:
        data = parse_compose_json(text)
    except json.JSONDecodeError:
        return []
    valid_slots = {b["slot"] for b in battles}
    slot_position = {b["slot"]: b["position"] for b in battles}
    candidate_keys: dict[str, str] = {}
    for b in battles:
        for c in b.get("candidates") or []:
            candidate_keys[norm_name(c)] = c

    rows: list[dict[str, Any]] = []
    for sig in data.get("signals") or []:
        rid = sig.get("raw_item_id")
        slot = (sig.get("slot") or "").upper()
        direction = (sig.get("direction") or "").lower()
        strength = sig.get("strength")
        signal_type = (sig.get("signal_type") or "").lower()
        summary = (sig.get("summary") or "").strip()
        raw_name = (sig.get("player_name") or "").strip()
        if not rid or rid not in items_by_id:
            continue
        if slot not in valid_slots:
            continue
        if direction not in ("up", "down", "neutral"):
            continue
        if signal_type not in (
            "camp_rep",
            "coach_quote",
            "beat_report",
            "practice_snap",
            "injury",
            "rumor",
            "projection",
        ):
            continue
        try:
            strength_i = int(strength)
        except (TypeError, ValueError):
            continue
        if strength_i < 1 or strength_i > 3:
            continue
        if not summary:
            continue
        canon = candidate_keys.get(norm_name(raw_name))
        if not canon:
            continue
        item = items_by_id[rid]
        if signal_type == "rumor" and strength_i > 2:
            strength_i = 2
        if signal_type == "projection" and strength_i > 1:
            strength_i = 1
        rows.append(
            {
                "content_date": content_date.isoformat(),
                "team_abbr": team_abbr,
                "position": slot_position[slot],
                "slot": slot,
                "player_name": canon,
                "direction": direction,
                "strength": strength_i,
                "signal_type": signal_type,
                "summary": summary[:500],
                "raw_item_id": rid,
                "source_url": item.get("url"),
                "source_tier": item.get("source_tier", 3),
                "metadata": {"model": EXTRACT_MODEL},
            }
        )
    return rows


def extract_team_signals(
    client: anthropic.Anthropic,
    *,
    team_abbr: str,
    team_slug: str,
    content_date: date,
    all_battles: list[dict],
    slug_to_id: dict[str, str],
    raw_items: list[dict],
) -> int:
    battles = _battles_for_team(all_battles, team_abbr)
    if not battles:
        return 0
    candidates = _candidate_pool(battles)
    item_ids = [i["id"] for i in raw_items if i.get("id")]
    processed = fetch_processed_raw_item_ids(item_ids)
    items = _filter_items_for_team(
        raw_items, team_slug, slug_to_id, candidates, processed
    )
    if not items:
        return 0
    items_by_id = {i["id"]: i for i in items}
    msg = client.messages.create(
        model=EXTRACT_MODEL,
        max_tokens=2000,
        messages=[
            {
                "role": "user",
                "content": _build_user_payload(team_abbr, battles, items),
            }
        ],
    )
    text = msg.content[0].text
    rows = _parse_signals(
        text,
        team_abbr=team_abbr,
        content_date=content_date,
        items_by_id=items_by_id,
        battles=battles,
    )
    return upsert_camp_signals(rows)


def extract_camp_signals_for_date(
    content_date: date,
    *,
    team_abbr: str | None = None,
) -> dict[str, int]:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY required for camp signal extraction")

    from .camp_signals_common import abbrev_to_slug, teams_by_abbrev

    all_battles = fetch_position_battles()
    slug_to_id = fetch_team_id_map()
    raw_items = fetch_raw_items_for_date(content_date)
    client = anthropic.Anthropic(api_key=api_key)

    abbr_map = teams_by_abbrev()
    targets: list[tuple[str, str]] = []
    if team_abbr:
        slug = abbrev_to_slug(team_abbr)
        if not slug:
            raise ValueError(f"Unknown team abbrev: {team_abbr}")
        targets.append((team_abbr.upper(), slug))
    else:
        seen: set[str] = set()
        for b in all_battles:
            if b.get("status") not in ("contested", "open"):
                continue
            ab = b["team_abbr"]
            if ab in seen:
                continue
            slug = abbrev_to_slug(ab)
            if slug:
                seen.add(ab)
                targets.append((ab, slug))

    totals: dict[str, int] = {"teams": 0, "signals": 0}
    for ab, slug in sorted(targets):
        n = extract_team_signals(
            client,
            team_abbr=ab,
            team_slug=slug,
            content_date=content_date,
            all_battles=all_battles,
            slug_to_id=slug_to_id,
            raw_items=raw_items,
        )
        if n:
            totals["teams"] += 1
            totals["signals"] += n
        _ = abbr_map.get(ab)
    return totals
