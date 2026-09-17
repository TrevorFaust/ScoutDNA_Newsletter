"""Load team stats, coaching, and roster context from Supabase for compose."""

from __future__ import annotations

import json
import re
from typing import Any

from .db import get_client
from .teams import Team

SKILL_POSITIONS = ("QB", "RB", "WR", "TE", "K")
FANTASY_DEPTH_SEASON = 2026
USAGE_SEASON = 2026
RB_LEAD_SPLIT_MAX = 45
RB2_SPLIT_MIN = 25
WR_TARGET_LEADER_MIN = 22
WR_SPLIT_GAP_MAX = 8
TE_FEATURED_MIN = 18
USAGE_PLAYER_LIMIT = 12
# ESPN PRE boxes store LAR as LA and ARI as AZ; newsletter/nflverse use LAR/ARI.
USAGE_TEAM_ALIASES = {
    "LAR": ("LAR", "LA"),
    "LA": ("LA", "LAR"),
    "ARI": ("ARI", "AZ"),
    "AZ": ("AZ", "ARI"),
    "WAS": ("WAS", "WSH"),
    "WSH": ("WSH", "WAS"),
}


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _implied_team_snaps(offense_snaps: Any, snap_pct: Any) -> float | None:
    snaps = _num(offense_snaps)
    pct = _num(snap_pct)
    if snaps <= 0 or pct <= 0:
        return None
    return snaps / (pct / 100.0)


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


_SUFFIXES = frozenset({"jr", "sr", "ii", "iii", "iv", "v"})
_SURNAME_INDEX: dict[str, list[dict[str, str]]] | None = None
_TEAM_ALIAS = {"AZ": "ARI", "LA": "LAR"}


def _last_name(full_name: str) -> str | None:
    tokens = [t for t in (full_name or "").split() if t]
    while tokens and re.sub(r"[^a-z]", "", tokens[-1].lower()) in _SUFFIXES:
        tokens.pop()
    if len(tokens) < 2:
        return None
    return tokens[-1]


def _canon_team(abbr: str) -> str:
    upper = (abbr or "").strip().upper()
    return _TEAM_ALIAS.get(upper, upper)


def _league_surname_index() -> dict[str, list[dict[str, str]]]:
    """Cache last-name → [{name, team, pos}] across rosters_2026."""
    global _SURNAME_INDEX
    if _SURNAME_INDEX is not None:
        return _SURNAME_INDEX
    sb = get_client()
    rows: list[dict] = []
    page = 1000
    offset = 0
    while True:
        batch = (
            sb.table("rosters_2026")
            .select("full_name, team_abbr, position")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    index: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        name = (row.get("full_name") or "").strip()
        team = _canon_team(row.get("team_abbr") or "")
        last = _last_name(name)
        if not name or not team or not last:
            continue
        key = last.lower()
        index.setdefault(key, []).append(
            {
                "name": name,
                "team": team,
                "pos": (row.get("position") or "").strip(),
            }
        )
    _SURNAME_INDEX = index
    return index


def _name_collisions_for_team(team_abbr: str) -> dict[str, dict[str, Any]]:
    """Last names on this roster that also exist on another club."""
    team = _canon_team(team_abbr)
    index = _league_surname_index()
    out: dict[str, dict[str, Any]] = {}
    for last, people in index.items():
        here = [p for p in people if p["team"] == team]
        others = [p for p in people if p["team"] != team]
        if not here or not others:
            continue
        # Dedup by name
        seen_here: set[str] = set()
        this_team: list[str] = []
        for p in here:
            if p["name"] in seen_here:
                continue
            seen_here.add(p["name"])
            label = f"{p['name']} ({p['pos']})" if p["pos"] else p["name"]
            this_team.append(label)
        seen_other: set[str] = set()
        other_labels: list[str] = []
        for p in others:
            tag = f"{p['name']}|{p['team']}"
            if tag in seen_other:
                continue
            seen_other.add(tag)
            extra = f"{p['name']} ({p['team']} {p['pos']})".strip()
            other_labels.append(extra)
        display_last = _last_name(here[0]["name"]) or last.capitalize()
        out[display_last] = {
            "this_team": this_team,
            "not_these_players": other_labels[:8],
        }
    return out


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
            .select("position, depth_rank, player_name, notes")
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
        note = (r.get("notes") or "").strip()
        if note:
            entry["notes"] = note
        out.append(entry)
    return out


def _starter_skill_names(team_abbr: str) -> set[str]:
    """QB1/RB1/WR1/TE1 names so sit/cameo weeks still reach compose."""
    return {
        row["name"]
        for row in _fetch_fantasy_skill_depth(team_abbr, {})
        if (row.get("slot") or "").endswith("1") and row.get("name")
    }


def skill_player_names(team_abbr: str) -> list[str]:
    """Skill roster + curated depth names for same-week follow-up matching."""
    names: list[str] = []
    seen: set[str] = set()
    for row in _fetch_roster_skill(team_abbr, {}, limit=50):
        name = (row.get("name") or "").strip()
        key = _norm_name(name)
        if name and key not in seen:
            seen.add(key)
            names.append(name)
    for row in _fetch_fantasy_skill_depth(team_abbr, {}):
        name = (row.get("name") or "").strip()
        key = _norm_name(name)
        if name and key not in seen:
            seen.add(key)
            names.append(name)
    return names


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


def _compact_usage_player(row: dict[str, Any], prior: dict[str, Any] | None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "name": row.get("player_name"),
        "pos": row.get("position"),
    }
    for key, src in (
        ("snaps", "offense_snaps"),
        ("snap_pct", "snap_pct"),
        ("pass_attempts", "pass_attempts"),
        ("pass_yd", "passing_yards"),
        ("pass_td", "passing_tds"),
        ("int", "interceptions"),
        ("rush_share", "rush_share"),
        ("rb_rush_share", "rb_rush_share"),
        ("carries", "carries"),
        ("rush_yd", "rushing_yards"),
        ("rush_td", "rushing_tds"),
        ("targets", "targets"),
        ("target_share", "target_share"),
        ("air_yards_share", "air_yards_share"),
        ("rec", "receptions"),
        ("rec_yd", "receiving_yards"),
        ("rec_td", "receiving_tds"),
        ("ppr", "fantasy_points_ppr"),
    ):
        val = row.get(src)
        if val is not None:
            out[key] = val
    if prior and row.get("fantasy_points_ppr") is not None and prior.get("fantasy_points_ppr") is not None:
        delta = round(float(row["fantasy_points_ppr"]) - float(prior["fantasy_points_ppr"]), 1)
        if delta:
            out["ppr_delta"] = delta
    tgt = row.get("targets")
    prior_tgt = prior.get("targets") if prior else None
    if tgt is not None and prior_tgt is not None:
        d = int(tgt) - int(prior_tgt)
        if d:
            out["target_delta"] = d
    return out


def _meaningful_usage(row: dict[str, Any]) -> bool:
    snap = row.get("snap_pct") or 0
    targets = row.get("targets") or 0
    carries = row.get("carries") or 0
    ppr = row.get("fantasy_points_ppr") or 0
    attempts = row.get("pass_attempts") or 0
    snaps = row.get("offense_snaps") or 0
    return (
        snap >= 15
        or targets >= 2
        or carries >= 3
        or ppr >= 5
        or attempts >= 1
        or snaps >= 1
    )


def _usage_flags(week_rows: list[dict[str, Any]], season_type: str) -> list[str]:
    # PRE boxes are starter sit + camp bodies. Do not prompt compose with committee flags.
    if (season_type or "").upper() == "PRE":
        return []
    flags: list[str] = []
    rbs = [r for r in week_rows if r.get("position") == "RB"]

    def _rb_work(r: dict[str, Any]) -> float:
        return float(r.get("rb_rush_share") or r.get("rush_share") or 0)

    rbs.sort(key=_rb_work, reverse=True)
    if len(rbs) >= 2:
        lead = _rb_work(rbs[0])
        second = _rb_work(rbs[1])
        if lead < RB_LEAD_SPLIT_MAX or second >= RB2_SPLIT_MIN:
            flags.append("split_backfield")
    pass_catchers = [r for r in week_rows if r.get("position") in ("WR", "TE")]
    pass_catchers.sort(key=lambda r: float(r.get("target_share") or 0), reverse=True)
    if pass_catchers:
        lead_share = float(pass_catchers[0].get("target_share") or 0)
        if lead_share >= WR_TARGET_LEADER_MIN:
            flags.append("target_leader")
        if len(pass_catchers) >= 2:
            gap = lead_share - float(pass_catchers[1].get("target_share") or 0)
            if gap <= WR_SPLIT_GAP_MAX and lead_share >= 12:
                flags.append("wr_target_split")
    tes = [r for r in week_rows if r.get("position") == "TE"]
    if any(float(r.get("target_share") or 0) >= TE_FEATURED_MIN for r in tes):
        flags.append("te_featured")
    return flags


def usage_team_abbrs(team_abbr: str) -> list[str]:
    key = (team_abbr or "").upper()
    return list(USAGE_TEAM_ALIASES.get(key, (key,)))


def _fetch_skill_usage(team_abbr: str) -> dict[str, Any] | None:
    sb = get_client()
    abbrs = usage_team_abbrs(team_abbr)
    try:
        resp = (
            sb.table("player_week_usage")
            .select(
                "season,season_type,week,player_name,position,offense_snaps,snap_pct,"
                "pass_attempts,passing_yards,passing_tds,interceptions,"
                "carries,rushing_yards,rushing_tds,targets,receptions,"
                "receiving_yards,receiving_tds,receiving_air_yards,"
                "fantasy_points_ppr,rush_share,rb_rush_share,target_share,air_yards_share,touch_share,"
                "team_carries,team_targets,team_air_yards"
            )
            .eq("season", USAGE_SEASON)
            .in_("team_abbr", abbrs)
            .order("week")
            .limit(200)
            .execute()
        )
        rows = resp.data or []
    except Exception:
        return None
    if not rows:
        return None

    types = {r.get("season_type") for r in rows}
    season_type = "REG" if "REG" in types else "PRE" if "PRE" in types else "POST"
    typed = [r for r in rows if r.get("season_type") == season_type]
    latest_week = max(int(r["week"]) for r in typed)
    starters = _starter_skill_names(team_abbr)
    week_rows = [r for r in typed if int(r["week"]) == latest_week]
    latest = [
        r
        for r in week_rows
        if _meaningful_usage(r) or (r.get("player_name") or "") in starters
    ]
    prior_week = latest_week - 1
    prior_by_name = {
        r["player_name"]: r
        for r in typed
        if int(r["week"]) == prior_week
    }

    def _rank_key(r: dict[str, Any]) -> float:
        return float(r.get("fantasy_points_ppr") or 0) + float(r.get("snap_pct") or 0) / 10

    latest.sort(key=_rank_key, reverse=True)
    all_latest = list(latest)
    kept = latest[:USAGE_PLAYER_LIMIT]
    kept_names = {r.get("player_name") for r in kept}
    for r in latest:
        name = r.get("player_name") or ""
        if name in starters and name not in kept_names:
            kept.append(r)
            kept_names.add(name)
    latest = kept

    # True season shares: player totals / team season totals (not avg of weekly %).
    team_week: dict[int, dict[str, float]] = {}
    for r in typed:
        week = int(r["week"])
        tw = team_week.setdefault(week, {"carries": 0.0, "targets": 0.0, "air": 0.0, "snaps": 0.0})
        if r.get("team_carries") is not None:
            tw["carries"] = _num(r.get("team_carries"))
        if r.get("team_targets") is not None:
            tw["targets"] = _num(r.get("team_targets"))
        if r.get("team_air_yards") is not None:
            tw["air"] = _num(r.get("team_air_yards"))
        implied = _implied_team_snaps(r.get("offense_snaps"), r.get("snap_pct"))
        if implied is not None and implied > tw["snaps"]:
            tw["snaps"] = implied

    team_carries = sum(v["carries"] for v in team_week.values())
    team_targets = sum(v["targets"] for v in team_week.values())
    team_air = sum(v["air"] for v in team_week.values())
    team_snaps = sum(v["snaps"] for v in team_week.values())

    std_acc: dict[str, dict[str, Any]] = {}
    for r in typed:
        if not _meaningful_usage(r) and r.get("player_name") not in std_acc:
            continue
        name = r["player_name"]
        acc = std_acc.setdefault(
            name,
            {
                "player_name": name,
                "position": r.get("position"),
                "targets": 0,
                "receptions": 0,
                "carries": 0,
                "receiving_air_yards": 0.0,
                "fantasy_points_ppr": 0.0,
                "offense_snaps": 0.0,
            },
        )
        for key in ("targets", "receptions", "carries"):
            acc[key] += int(r.get(key) or 0)
        acc["receiving_air_yards"] += _num(r.get("receiving_air_yards"))
        acc["fantasy_points_ppr"] += _num(r.get("fantasy_points_ppr"))
        acc["offense_snaps"] += _num(r.get("offense_snaps"))

    std_rows: list[dict[str, Any]] = []
    for name, acc in std_acc.items():
        row = {
            "player_name": name,
            "position": acc["position"],
            "targets": acc["targets"],
            "receptions": acc["receptions"],
            "carries": acc["carries"],
            "fantasy_points_ppr": round(acc["fantasy_points_ppr"], 1),
            "snap_pct": (
                round(100.0 * acc["offense_snaps"] / team_snaps, 1) if team_snaps else None
            ),
            "rush_share": (
                round(100.0 * acc["carries"] / team_carries, 1) if team_carries else None
            ),
            "target_share": (
                round(100.0 * acc["targets"] / team_targets, 1) if team_targets else None
            ),
            "air_yards_share": (
                round(100.0 * acc["receiving_air_yards"] / team_air, 1) if team_air else None
            ),
        }
        std_rows.append(row)
    std_rows.sort(key=_rank_key, reverse=True)

    return {
        "source": (
            "nflverse"
            if any(r.get("snap_pct") is not None for r in typed)
            else "espn"
        ),
        "scoring": "PPR",
        "window": {
            "season": USAGE_SEASON,
            "season_type": season_type,
            "week": latest_week,
        },
        "flags": _usage_flags(latest, season_type),
        "latest_week": [
            _compact_usage_player(r, prior_by_name.get(r["player_name"])) for r in latest
        ],
        "latest_week_full": [
            _compact_usage_player(r, prior_by_name.get(r["player_name"])) for r in all_latest
        ],
        "season_to_date": [
            _compact_usage_player(r, None) for r in std_rows[:USAGE_PLAYER_LIMIT]
        ],
    }


def latest_team_game(team_abbr: str) -> dict[str, Any] | None:
    """Latest completed nflverse game for this club (scores + yards allowed)."""
    sb = get_client()
    abbrs = usage_team_abbrs(team_abbr)
    try:
        resp = (
            sb.table("team_week_results")
            .select(
                "season,season_type,week,team_abbr,opponent_abbr,gameday,home,"
                "points_for,points_against,result,yards_allowed,"
                "passing_yards_allowed,rushing_yards_allowed,turnovers_forced"
            )
            .eq("season", USAGE_SEASON)
            .in_("team_abbr", abbrs)
            .not_.is_("points_for", "null")
            .order("week", desc=True)
            .limit(8)
            .execute()
        )
        rows = resp.data or []
    except Exception:
        return None
    if not rows:
        return None
    types = {r.get("season_type") for r in rows}
    season_type = "REG" if "REG" in types else "PRE" if "PRE" in types else "POST"
    typed = [r for r in rows if r.get("season_type") == season_type]
    if not typed:
        return None
    latest_week = max(int(r["week"]) for r in typed)
    row = next(r for r in typed if int(r["week"]) == latest_week)
    out: dict[str, Any] = {
        "season": row.get("season"),
        "season_type": season_type,
        "week": latest_week,
        "opponent": row.get("opponent_abbr"),
        "gameday": row.get("gameday"),
        "home": row.get("home"),
        "points_for": row.get("points_for"),
        "points_against": row.get("points_against"),
        "result": row.get("result"),
    }
    for key in (
        "yards_allowed",
        "passing_yards_allowed",
        "rushing_yards_allowed",
        "turnovers_forced",
    ):
        if row.get(key) is not None:
            out[key] = row[key]
    return out


def latest_week_usage_players(team_abbr: str) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    """Latest usage window plus compact rows keyed by player name."""
    usage = _fetch_skill_usage(team_abbr)
    if not usage:
        return {}, {}
    window = usage.get("window") or {}
    by_name: dict[str, dict[str, Any]] = {}
    for row in usage.get("latest_week_full") or usage.get("latest_week") or []:
        name = (row.get("name") or "").strip()
        if name:
            by_name[name] = row
    return window, by_name


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

    collisions = _name_collisions_for_team(abbr)
    if collisions:
        block["name_collisions"] = collisions

    fantasy_depth = _fetch_fantasy_skill_depth(abbr, exp_map)
    if fantasy_depth:
        block["fantasy_skill_depth"] = fantasy_depth

    skill_battles = _fetch_skill_position_battles(abbr)
    if skill_battles:
        block["skill_position_battles"] = skill_battles

    depth = _fetch_depth_by_team(abbr)
    if depth:
        block["depth_chart_ol_def"] = depth

    usage = _fetch_skill_usage(abbr)
    if usage:
        usage = {k: v for k, v in usage.items() if k != "latest_week_full"}
        block["skill_usage"] = usage
    latest_game = latest_team_game(abbr)
    if latest_game:
        block["latest_game"] = latest_game

    if len(block) <= 2:
        return ""

    return (
        "Authoritative team context. Offseason rosters are volatile until 53-man cuts; "
        "player_experience and draft_capital_2026 are for fact-checking only — do not echo years "
        "or list the full draft class. Use draft_capital_2026 only when citing a named player's "
        "round/pick in today's news (round 0 or missing = unknown). "
        "Fantasy_skill_depth = authoritative depth order for prose labels (WR1 WR2 WR3 …). "
        "If you say someone is WR2/WR3, those numbers MUST match this list unless you explicitly "
        "quote a conflicting camp depth chart. name_collisions lists last names on THIS roster "
        "that also exist elsewhere (Houston Higgins is Jayden, never Tee). If a source uses only "
        "a last name, pick the this_team player. skill_position_battles = YOUR curated truth for "
        "which slots are settled vs contested vs open (any skill position). "
        "status settled = role largely defined; contested = name candidates when news touches "
        "that slot (not every paragraph); open = do not crown a starter without source support. "
        "A settled note that names a complement (Gainwell signed to complement Irving) is role "
        "context for fantasy, not a reason to omit the backup. "
        "Slot labels cascade (losers fill next slot; gaps like WR2 then WR4 are intentional). "
        "draft_capital_2026 includes OL/DEF picks. OL rookies count as rookies in prose when "
        "newsworthy; tie to run/pass impact on QB/RB/WR/TE, not IDP stash. depth_chart_ol_def "
        "= OL/DEF depth for fact-checking trench names. team_stats_2025 may include "
        "sos_2026_rank and sos_2026_opp_win_pct (lower opp win pct / easier SOS favors "
        "already-strong team DEF. Elite 2025 units (top ~8 yards or points) are earlier-round "
        "DEF targets, not vague late-round fliers; easy SOS does not rescue a weak unit). "
        "skill_usage = PPR box + rush/target shares for the latest available 2026 week "
        "(nflverse when published; ESPN preseason boxes until then). snaps = offense_snaps; "
        "pass_attempts is present on ESPN rows when snaps are not. Cite ONLY numbers in this "
        "block. Never invent shares, snaps, yards, or drive counts. "
        "latest_game = this club's most recent completed game (opponent, score, yards allowed, "
        "turnovers). Cite those DEF numbers only; never invent a score. "
        "If window.season_type is PRE: committee / target-leader flags are omitted on purpose. "
        "Do not treat PRE shares as a depth chart. Starters often sit or take a series to get "
        "warm (Chase Brown or Breece Hall with a handful of carries is maintenance, not a split). "
        "Unnamed camp and third-team box-score leaders are noise. "
        "When news already names a player's preseason game, cite 1-2 counting stats from this "
        "block for that player (rec/rec_yd/rec_td, pass_yd/pass_td/pass_attempts, carries). "
        "target_share is optional color on that same named player, not a job win. "
        "Also allowed: a starter sitting / leaving, or a same-week closer on will-they-play "
        "(snaps or pass_attempts). "
        "If a named player was previewed to play this week's preseason game, skill_usage "
        "latest_week for that player is the required closer (how they actually did). "
        "Never leave 'will play' / 'confirmed to play' hanging after the box exists. "
        "If REG or POST: the week's game IS the story. Lead with who scored fantasy "
        "points (ppr), how they were used, and the outlook. Named players do not need "
        "a counting line on every mention; use skill_usage numbers when they help the "
        "sentence. WR/TE: rec + rec_yd when relevant, plus snap_pct (routes-run is not "
        "in this dataset). RB: rush_yd/carries plus snap_pct and rb_rush_share in split "
        "backfields (4 carries vs 12 is 25% of RB work). QB: pass_yd plus rush_yd when "
        "it matters. Then one insight from reporting: why it was good, quiet, or "
        "disappointing. 3rd-string meaningful snaps are a flyer, not the lead. "
        "Team DEF is at most one short beat from latest_game (points allowed, yards "
        "allowed, turnovers). Mention RB splits when flags include split_backfield "
        "(lead RB under ~45% of RB carries or RB2 at 25%+). Mention WR/TE snap_pct or "
        "target share when a player is featured or flags include wr_target_split / "
        "te_featured. Use ppr_delta / target_delta for 'up from last week' lines. An "
        "80/20 backfield is not a committee:\n"
        + json.dumps(block, indent=2, default=str)
    )
