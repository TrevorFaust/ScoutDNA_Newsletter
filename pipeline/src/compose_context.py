"""Load team stats, coaching, and roster context from Supabase for compose."""

from __future__ import annotations

import json
import re
from typing import Any

from .db import get_client
from .teams import Team

SKILL_POSITIONS = ("QB", "RB", "WR", "TE", "K")
FANTASY_DEPTH_SEASON = 2026


def experience_label(years_exp: int | None) -> str | None:
    """
    nflverse years_exp: 0 = rookie (first NFL season), 1 = second year, etc.
    """
    if years_exp is None:
        return None
    if years_exp <= 0:
        return "rookie"
    if years_exp == 1:
        return "second year"
    if years_exp == 2:
        return "third year"
    if years_exp >= 10:
        return f"{years_exp + 1}th-year veteran"
    ordinals = {3: "fourth", 4: "fifth", 5: "sixth", 6: "seventh", 7: "eighth", 8: "ninth"}
    word = ordinals.get(years_exp, f"year-{years_exp + 1}")
    return f"{word} year"


def _norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _fetch_one(table: str, team_abbr: str) -> dict[str, Any] | None:
    sb = get_client()
    try:
        resp = sb.table(table).select("*").eq("team_abbr", team_abbr).limit(1).execute()
        rows = resp.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def _fetch_roster_experience_map(team_abbr: str) -> dict[str, dict[str, Any]]:
    """All roster rows for team (any status) — source of truth for years_exp."""
    sb = get_client()
    try:
        resp = (
            sb.table("rosters_2026")
            .select("full_name, position, years_exp, rookie_year, status")
            .eq("team_abbr", team_abbr)
            .execute()
        )
    except Exception:
        return {}
    by_name: dict[str, dict[str, Any]] = {}
    for r in resp.data or []:
        key = _norm_name(r.get("full_name") or "")
        if key:
            exp = r.get("years_exp")
            by_name[key] = {
                "name": r["full_name"],
                "pos": r.get("position"),
                "years_exp": exp,
                "experience": experience_label(exp if exp is not None else None),
                "rookie_year": r.get("rookie_year"),
                "status": r.get("status"),
            }
    return by_name


def _fetch_roster_skill(team_abbr: str, exp_map: dict[str, dict], *, limit: int = 40) -> list[dict]:
    sb = get_client()
    try:
        resp = (
            sb.table("rosters_2026")
            .select("full_name, position, years_exp, status, depth_chart_position")
            .eq("team_abbr", team_abbr)
            .in_("position", list(SKILL_POSITIONS))
            .eq("status", "ACT")
            .order("position")
            .limit(limit)
            .execute()
        )
        rows = resp.data or []
    except Exception:
        return []
    out: list[dict] = []
    for r in rows:
        exp = r.get("years_exp")
        out.append(
            {
                "name": r["full_name"],
                "pos": r["position"],
                "depth": r.get("depth_chart_position"),
                "years_exp": exp,
                "experience": experience_label(exp if exp is not None else None),
            }
        )
    return out


def _fetch_fantasy_skill_depth(team_abbr: str, exp_map: dict[str, dict]) -> list[dict]:
    sb = get_client()
    try:
        resp = (
            sb.table("fantasy_team_depth")
            .select("position, depth_rank, player_name")
            .eq("season", FANTASY_DEPTH_SEASON)
            .eq("team_abbr", team_abbr)
            .order("position")
            .order("depth_rank")
            .execute()
        )
        rows = resp.data or []
    except Exception:
        return []
    out: list[dict] = []
    for r in rows:
        name = r["player_name"]
        meta = exp_map.get(_norm_name(name), {})
        entry: dict[str, Any] = {
            "slot": f"{r['position']}{r['depth_rank']}",
            "name": name,
        }
        if meta.get("years_exp") is not None:
            entry["years_exp"] = meta["years_exp"]
            entry["experience"] = meta.get("experience")
        out.append(entry)
    return out


def _fetch_skill_position_battles(team_abbr: str) -> list[dict]:
    """Curated QB/RB/WR/TE battles from fantasy_position_battles (you maintain the CSV)."""
    sb = get_client()
    try:
        resp = (
            sb.table("fantasy_position_battles")
            .select("position, slot, status, candidates, note")
            .eq("season", FANTASY_DEPTH_SEASON)
            .eq("team_abbr", team_abbr)
            .order("position")
            .order("slot")
            .execute()
        )
        rows = resp.data or []
    except Exception:
        return []
    return [
        {
            "position": r.get("position"),
            "slot": r.get("slot"),
            "status": r.get("status"),
            "candidates": r.get("candidates") or [],
            "note": r.get("note"),
        }
        for r in rows
        if r.get("slot") and r.get("status")
    ]


def _fetch_rookies_2026(team_abbr: str) -> list[dict]:
    """Fantasy skill rookies on roster — years_exp only; draft round comes from draft_picks_2026."""
    sb = get_client()
    try:
        resp = (
            sb.table("rookies_2026")
            .select("player_name, position, years_exp, college")
            .eq("nfl_team", team_abbr)
            .execute()
        )
        return resp.data or []
    except Exception:
        return []


def _fetch_draft_picks_2026(team_abbr: str) -> list[dict]:
    sb = get_client()
    try:
        resp = (
            sb.table("draft_picks_2026")
            .select("player_name, position, round, overall_pick")
            .eq("team_abbr", team_abbr)
            .eq("season", FANTASY_DEPTH_SEASON)
            .order("round")
            .order("overall_pick")
            .execute()
        )
        return resp.data or []
    except Exception:
        return []


def _draft_capital_by_name(picks: list[dict]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for p in picks:
        rnd = p.get("round")
        if rnd is None or rnd < 1:
            continue
        name = (p.get("player_name") or "").strip()
        key = _norm_name(name)
        if not key:
            continue
        out[key] = {
            "name": name,
            "round": rnd,
            "overall_pick": p.get("overall_pick"),
            "pos": p.get("position"),
        }
    return out


def _apply_draft_capital_to_exp_map(
    exp_map: dict[str, dict[str, Any]], draft_by_name: dict[str, dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    for key, draft in draft_by_name.items():
        entry = exp_map.get(key)
        if not entry:
            continue
        if draft.get("round") is not None:
            entry["draft_round"] = draft["round"]
        if draft.get("overall_pick") is not None:
            entry["draft_overall_pick"] = draft["overall_pick"]
    return exp_map


def _merge_rookies_into_exp_map(
    exp_map: dict[str, dict[str, Any]],
    rookies: list[dict],
    draft_by_name: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """rookies_2026 = fantasy skill positions only (no OL); confirms rookie status when listed."""
    for r in rookies:
        name = r.get("player_name") or ""
        key = _norm_name(name)
        if not key:
            continue
        exp = r.get("years_exp")
        if exp is None:
            exp = 0
        draft = draft_by_name.get(key)
        draft_meta: dict[str, Any] = {}
        if draft:
            draft_meta["draft_round"] = draft.get("round")
            draft_meta["draft_overall_pick"] = draft.get("overall_pick")
        existing = exp_map.get(key)
        if existing and existing.get("years_exp") is not None:
            existing.update({k: v for k, v in draft_meta.items() if v is not None})
            continue
        exp_map[key] = {
            "name": name,
            "pos": r.get("position"),
            "years_exp": exp,
            "experience": experience_label(exp),
            "rookie_year": 2026,
            "status": "rookie_pool",
            "college": r.get("college"),
            **draft_meta,
        }
    return exp_map


def _fetch_depth_by_team(team_abbr: str) -> list[dict]:
    sb = get_client()
    try:
        resp = (
            sb.table("depth_charts_2026")
            .select("player_name, pos_abb, pos_name, pos_rank, gsis_id")
            .eq("team_abbr", team_abbr)
            .lte("pos_rank", 2)
            .order("pos_abb")
            .order("pos_rank")
            .limit(80)
            .execute()
        )
        rows = resp.data or []
        skill_pos = {"QB", "RB", "WR", "TE"}
        return [r for r in rows if (r.get("pos_abb") or "") not in skill_pos]
    except Exception:
        return []


def load_compose_context(team: Team) -> str:
    abbr = team.abbrev.upper()
    block: dict[str, Any] = {"team_abbr": abbr, "team_name": team.name}

    stats = _fetch_one("nfl_team_context_2025", abbr)
    if stats:
        block["team_stats_2025"] = {
            k: v
            for k, v in stats.items()
            if k not in ("team_abbr", "updated_at") and v is not None
        }

    coaching = _fetch_one("team_coaching_2026", abbr)
    if coaching:
        block["coaching_2026"] = {
            k: v
            for k, v in coaching.items()
            if k not in ("team_abbr", "team_name", "updated_at") and v is not None
        }

    exp_map = _fetch_roster_experience_map(abbr)
    draft_picks = _fetch_draft_picks_2026(abbr)
    draft_by_name = _draft_capital_by_name(draft_picks)
    if draft_by_name:
        block["draft_capital_2026"] = {
            v["name"]: {
                k: v[k]
                for k in ("round", "overall_pick", "pos")
                if v.get(k) is not None
            }
            for v in draft_by_name.values()
        }
        exp_map = _apply_draft_capital_to_exp_map(exp_map, draft_by_name)
    rookies = _fetch_rookies_2026(abbr)
    if rookies:
        exp_map = _merge_rookies_into_exp_map(exp_map, rookies, draft_by_name)

    if exp_map:
        block["player_experience"] = {
            v["name"]: {
                k: v[k]
                for k in ("years_exp", "experience", "draft_round", "draft_overall_pick")
                if v.get(k) is not None
            }
            for v in exp_map.values()
            if v.get("years_exp") is not None or v.get("status") == "rookie_pool"
        }

    roster = _fetch_roster_skill(abbr, exp_map)
    if roster:
        block["skill_roster"] = roster

    fantasy_depth = _fetch_fantasy_skill_depth(abbr, exp_map)
    if fantasy_depth:
        block["fantasy_skill_depth"] = fantasy_depth

    skill_battles = _fetch_skill_position_battles(abbr)
    if skill_battles:
        block["skill_position_battles"] = skill_battles

    depth = _fetch_depth_by_team(abbr)
    if depth:
        block["depth_chart_ol_def"] = depth

    if len(block) <= 2:
        return ""

    return (
        "Authoritative team context. Offseason rosters are volatile until 53-man cuts; "
        "player_experience and draft_capital_2026 are for fact-checking only — do not echo years "
        "or list the full draft class. Use draft_capital_2026 only when citing a named player's "
        "round/pick in today's news (round 0 or missing = unknown). "
        "Fantasy_skill_depth = suggested depth order (WR1 WR2 …). skill_position_battles = YOUR "
        "curated truth for which slots are settled vs contested vs open (any skill position). "
        "status settled = role largely defined; contested = name candidates when news touches "
        "that slot (not every paragraph); open = do not crown a starter without source support. "
        "Slot labels cascade (losers fill next slot; gaps like WR2 then WR4 are intentional). "
        "draft_capital_2026 includes OL/DEF picks — OL rookies count as rookies in prose when "
        "newsworthy; tie to run/pass impact on QB/RB/WR/TE, not IDP stash. depth_chart_ol_def "
        "= OL/DEF depth for fact-checking trench names:\n"
        + json.dumps(block, indent=2, default=str)
    )
