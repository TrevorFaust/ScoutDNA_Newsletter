"""Build weekly compose input directly from a week of raw collected items.

There is no daily LLM compose step anymore (it only runs on demand). The weekly
edition clusters the full Tue-Mon window of raw items itself — the same
fuzzy-title clustering the old daily job used per-day, just applied across the
whole week — and ranks stories by day_count (how many distinct days a story
was reported) so recurring/prominent beats lead the recap. Regular-season
issues are labeled Week N recap.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date
from typing import Any

from .compose_context import (
    _fetch_skill_injuries,
    latest_team_game,
    latest_week_usage_players,
    skill_player_names,
)
from .dedupe import cluster_items
from .league_feed import cluster_league_feed, extract_league_feed_items
from .storage import fetch_raw_items_for_range
from .teams import Team
from .weekly_window import content_day_label, content_dates_for_week, recap_label

MAX_TEAM_CLUSTERS = 18
MAX_LEAGUE_CLUSTERS = 14
MAX_STORY_ARCS = 8

_SETUP_MARKERS = (
    "ahead of",
    "to play",
    "will play",
    "will start",
    "confirmed to play",
    "confirmed to start",
    "wants to play",
    "playing time",
    "starters to play",
    "starters in the preseason",
    "preparations",
    "expected to",
    "expected back",
    "day-to-day",
    "will be evaluated",
    "return to practice",
    "saturday's",
    "this saturday",
    "preseason opener",
)

_OUTCOME_MARKERS = (
    "preseason opener win",
    "preseason opener loss",
    "preseason victory",
    "preseason win",
    "threw for",
    "passing yards",
    "box score",
    "final score",
    "lost to",
    "fell to",
    "dropped their",
    "win their",
    "injury review",
    "postgame",
    "look sharp",
    "dominate",
    "all-22",
    "all 22",
    "left the game",
    "did not play",
    "two drives",
    "first drive",
    " mmqb",
    "victory",
)

_INJURY_MARKERS = (
    "injury",
    "injured",
    "scare",
    "limited",
    "questionable",
    "carted",
    "mri",
    "week-to-week",
)


def _day_labels(content_dates: list[str]) -> list[str]:
    labels: list[str] = []
    for iso in content_dates:
        try:
            labels.append(content_day_label(date.fromisoformat(iso)))
        except ValueError:
            continue
    return labels


def _normalize(raw: list[dict], slug_to_id: dict[str, str]) -> list[dict]:
    id_to_slug = {v: k for k, v in slug_to_id.items()}
    normalized = []
    for row in raw:
        slugs = [id_to_slug[tid] for tid in row.get("team_ids", []) if tid in id_to_slug]
        normalized.append({**row, "team_slugs": slugs})
    return normalized


def _cluster_text(cluster: dict[str, Any]) -> str:
    titles = " ".join(str(t or "") for t in (cluster.get("raw_titles") or []))
    return " ".join(
        [
            str(cluster.get("topic_label") or ""),
            str(cluster.get("summary_seed") or ""),
            titles,
        ]
    )


def _cluster_role(text: str) -> str:
    t = f" {text.lower()} "
    outcome = any(m in t for m in _OUTCOME_MARKERS)
    setup = any(m in t for m in _SETUP_MARKERS)
    if outcome:
        return "outcome"
    if setup:
        return "setup"
    if any(m in t for m in _INJURY_MARKERS):
        return "injury"
    return "other"


def _name_index(names: list[str]) -> tuple[list[str], dict[str, str]]:
    lasts: dict[str, list[str]] = defaultdict(list)
    for name in names:
        parts = name.split()
        if not parts:
            continue
        lasts[parts[-1].lower()].append(name)
    unique_last = {
        last: group[0]
        for last, group in lasts.items()
        if len(group) == 1 and len(last) >= 4
    }
    return names, unique_last


def _players_mentioned(
    text: str, full_names: list[str], unique_last: dict[str, str]
) -> list[str]:
    found: list[str] = []
    lower = text.lower()
    for name in sorted(full_names, key=len, reverse=True):
        if name.lower() in lower:
            found.append(name)
    for last, full in unique_last.items():
        if full in found:
            continue
        if re.search(rf"\b{re.escape(last)}\b", lower):
            found.append(full)
    return found


def _first_iso(cluster: dict[str, Any]) -> str:
    dates = cluster.get("content_dates") or []
    return dates[0] if dates else ""


def _last_iso(cluster: dict[str, Any]) -> str:
    dates = cluster.get("content_dates") or []
    return dates[-1] if dates else ""


def _game_line(row: dict[str, Any]) -> str | None:
    """Regular-season counting line for a named skill player. Position-aware."""
    pos = (row.get("pos") or "").upper()
    rec = row.get("rec")
    rec_yd = row.get("rec_yd")
    rec_td = row.get("rec_td")
    carries = row.get("carries")
    rush_yd = row.get("rush_yd")
    rush_td = row.get("rush_td")
    attempts = row.get("pass_attempts")
    pass_yd = row.get("pass_yd")
    pass_td = row.get("pass_td")

    def _rec_chunk() -> str | None:
        if not rec and rec_yd is None:
            return None
        line = f"{int(rec or 0)} catches for {int(rec_yd or 0)} yards"
        if rec_td:
            line += f", {int(rec_td)} TD" if int(rec_td) == 1 else f", {int(rec_td)} TDs"
        return line

    def _rush_chunk() -> str | None:
        if not carries and rush_yd is None:
            return None
        line = f"{int(carries or 0)} carries for {int(rush_yd or 0)} yards"
        if rush_td:
            line += f", {int(rush_td)} TD" if int(rush_td) == 1 else f", {int(rush_td)} TDs"
        return line

    if pos == "QB" or attempts:
        if not attempts and pass_yd is None:
            return _usage_line(row)
        parts = []
        if pass_yd is not None:
            parts.append(f"{int(pass_yd)} passing yards")
        if attempts:
            parts.append(f"{int(attempts)} attempts")
        if pass_td:
            parts.append(f"{int(pass_td)} TD" if int(pass_td) == 1 else f"{int(pass_td)} TDs")
        ints = row.get("int")
        if ints:
            parts.append(f"{int(ints)} INT")
        if rush_yd:
            parts.append(f"{int(rush_yd)} rushing yards")
        return ", ".join(parts) if parts else None
    if pos in ("WR", "TE"):
        rec_line = _rec_chunk()
        if rec_line:
            return rec_line
        return _rush_chunk()
    if pos == "RB":
        chunks = [c for c in (_rush_chunk(), _rec_chunk()) if c]
        return "; ".join(chunks) if chunks else None
    return _usage_line(row)


def _skill_box_row(row: dict[str, Any], line: str) -> dict[str, Any]:
    """Counting line plus usage fields compose may cite when they help the story."""
    item: dict[str, Any] = {
        "name": row.get("name"),
        "pos": row.get("pos"),
        "line": line,
    }
    if row.get("ppr") is not None:
        item["ppr"] = row["ppr"]
    pos = (row.get("pos") or "").upper()
    if pos in ("WR", "TE", "RB") and row.get("snap_pct") is not None:
        item["snap_pct"] = row["snap_pct"]
    if pos == "RB":
        if row.get("rb_rush_share") is not None:
            item["rb_rush_share"] = row["rb_rush_share"]
        elif row.get("rush_share") is not None:
            item["rush_share"] = row["rush_share"]
        if row.get("carries") is not None:
            item["carries"] = row["carries"]
    return item


def build_game_box(
    team: Team,
    usage_window: dict[str, Any],
    usage_by_name: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    """Fact block for the latest completed game: score + named skill lines."""
    game = latest_team_game(team.abbrev.upper())
    pos_rank = {"QB": 0, "RB": 1, "WR": 2, "TE": 3}
    skill: list[dict[str, Any]] = []
    ranked = sorted(
        usage_by_name.values(),
        key=lambda r: (pos_rank.get((r.get("pos") or "").upper(), 9), -float(r.get("ppr") or 0)),
    )
    for row in ranked:
        line = _game_line(row)
        if not line:
            continue
        skill.append(_skill_box_row(row, line))
        if len(skill) >= 10:
            break
    if not game and not skill:
        return None
    out: dict[str, Any] = {}
    if usage_window:
        out["window"] = usage_window
    if game:
        out["game"] = game
    if skill:
        out["skill"] = skill
    return out or None


def _usage_line(row: dict[str, Any]) -> str | None:
    """One counting-stat closer from compact skill_usage. None if the box is empty."""
    attempts = row.get("pass_attempts")
    pass_yd = row.get("pass_yd")
    pass_td = row.get("pass_td")
    if attempts:
        parts = [f"{int(attempts)} attempts"]
        if pass_yd is not None:
            parts.append(f"{int(pass_yd)} yards")
        if pass_td:
            parts.append(f"{int(pass_td)} TD" if int(pass_td) == 1 else f"{int(pass_td)} TDs")
        ints = row.get("int")
        if ints:
            parts.append(f"{int(ints)} INT")
        return ", ".join(parts)
    rec = row.get("rec")
    rec_yd = row.get("rec_yd")
    rec_td = row.get("rec_td")
    if rec or rec_yd:
        catches = int(rec or 0)
        yards = int(rec_yd or 0)
        line = f"{catches} catches for {yards} yards"
        if rec_td:
            line += f", {int(rec_td)} TD" if int(rec_td) == 1 else f", {int(rec_td)} TDs"
        return line
    carries = row.get("carries")
    rush_yd = row.get("rush_yd")
    if carries:
        line = f"{int(carries)} carries"
        if rush_yd is not None:
            line += f" for {int(rush_yd)} yards"
        return line
    snaps = row.get("snaps")
    if snaps:
        return f"{int(snaps)} snaps"
    return None


def build_story_arcs(
    topic_clusters: list[dict[str, Any]],
    player_names: list[str],
    usage_by_name: dict[str, dict[str, Any]] | None = None,
    usage_window: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Pair earlier setup/injury clusters with later outcomes for the same player.

    If a named player was previewed to play and skill_usage has their box, that
    box is the outcome even when no later cluster names them.
    """
    if not topic_clusters or not player_names:
        return []
    full_names, unique_last = _name_index(player_names)
    enriched: list[dict[str, Any]] = []
    for cluster in topic_clusters:
        text = _cluster_text(cluster)
        enriched.append(
            {
                **cluster,
                "_role": _cluster_role(text),
                "_players": _players_mentioned(text, full_names, unique_last),
            }
        )

    by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for cluster in enriched:
        for name in cluster["_players"]:
            by_player[name].append(cluster)

    arcs: list[dict[str, Any]] = []
    for player, clusters in by_player.items():
        outcomes = [c for c in clusters if c["_role"] == "outcome"]
        setups = [c for c in clusters if c["_role"] == "setup"]
        injuries = [c for c in clusters if c["_role"] == "injury"]
        usage_row = (usage_by_name or {}).get(player)
        usage_line = _usage_line(usage_row) if usage_row else None

        if outcomes:
            outcome = max(outcomes, key=_last_iso)
            outcome_day = _last_iso(outcome)
            earlier = [
                c
                for c in clusters
                if c is not outcome and _first_iso(c) and _first_iso(c) < outcome_day
            ]
            setup_pool = [c for c in earlier if c["_role"] == "setup"]
            injury_pool = [c for c in earlier if c["_role"] == "injury"]
            if setup_pool:
                setup = max(setup_pool, key=_last_iso)
            elif injury_pool:
                setup = max(injury_pool, key=_last_iso)
            else:
                setup = None
            if setup:
                payload: dict[str, Any] = {
                    "player": player,
                    "setup": {
                        "topic": setup.get("topic_label"),
                        "days": setup.get("day_labels") or [],
                    },
                    "outcome": {
                        "topic": outcome.get("topic_label"),
                        "days": outcome.get("day_labels") or [],
                    },
                }
                if usage_line:
                    payload["outcome"]["skill_usage_line"] = usage_line
                    if usage_window:
                        payload["outcome"]["window"] = usage_window
                arcs.append(payload)
                continue

        if usage_line and (setups or injuries):
            setup = max(setups or injuries, key=_last_iso)
            payload = {
                "player": player,
                "setup": {
                    "topic": setup.get("topic_label"),
                    "days": setup.get("day_labels") or [],
                },
                "outcome": {
                    "topic": "skill_usage game result",
                    "days": [],
                    "skill_usage_line": usage_line,
                },
            }
            if usage_window:
                payload["outcome"]["window"] = usage_window
            arcs.append(payload)

    arcs.sort(key=lambda a: a["outcome"]["days"][-1] if a["outcome"]["days"] else "")
    return arcs[:MAX_STORY_ARCS]


def build_play_sit_payoffs(
    topic_clusters: list[dict[str, Any]],
    player_names: list[str],
    usage_by_name: dict[str, dict[str, Any]],
    usage_window: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Named play/sit previews that now have a skill_usage box. Required closers."""
    if not topic_clusters or not usage_by_name:
        return []
    full_names, unique_last = _name_index(player_names)
    payoffs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for cluster in topic_clusters:
        text = _cluster_text(cluster)
        if _cluster_role(text) not in ("setup", "injury"):
            continue
        for name in _players_mentioned(text, full_names, unique_last):
            if name in seen:
                continue
            row = usage_by_name.get(name)
            line = _usage_line(row) if row else None
            if not line:
                continue
            seen.add(name)
            item: dict[str, Any] = {
                "player": name,
                "setup_topic": (cluster.get("topic_label") or "")[:140],
                "result": "played",
                "line": line,
            }
            if usage_window:
                item["window"] = usage_window
            payoffs.append(item)
    return payoffs[:MAX_STORY_ARCS]


def build_team_weekly_input(
    team: Team,
    weekly_issue_date: date,
    teams: list[Team],
    slug_to_id: dict[str, str],
) -> dict[str, Any]:
    content_start, content_end = content_dates_for_week(weekly_issue_date)
    raw = fetch_raw_items_for_range(content_start, content_end)
    normalized = [
        row for row in _normalize(raw, slug_to_id) if team.slug in row["team_slugs"]
    ]
    clusters = [c for c in cluster_items(normalized, teams) if c["team_slug"] == team.slug]
    clusters.sort(
        key=lambda c: (-len(c.get("content_dates") or []), -c.get("source_count", 1))
    )
    reserve = 4
    primary = clusters[: max(0, MAX_TEAM_CLUSTERS - reserve)]
    used = {id(c) for c in primary}
    leftover_outcomes = []
    for c in clusters:
        if id(c) in used:
            continue
        text = f"{c.get('canonical_title') or ''} {c.get('summary_seed') or ''}"
        if _cluster_role(text) == "outcome":
            leftover_outcomes.append(c)
    leftover_outcomes.sort(
        key=lambda c: (c.get("content_dates") or [""])[-1], reverse=True
    )
    extra = leftover_outcomes[:reserve]
    used.update(id(c) for c in extra)
    selected = primary + extra
    if len(selected) < MAX_TEAM_CLUSTERS:
        for c in clusters:
            if id(c) in used:
                continue
            selected.append(c)
            used.add(id(c))
            if len(selected) >= MAX_TEAM_CLUSTERS:
                break

    topic_clusters = []
    for c in selected:
        content_dates = c.get("content_dates") or []
        topic_clusters.append(
            {
                "topic_label": (c.get("canonical_title") or "")[:140],
                "summary_seed": (c.get("summary_seed") or "")[:400],
                "day_count": len(content_dates) or 1,
                "day_labels": _day_labels(content_dates),
                "content_dates": content_dates,
                "source_urls": (c.get("source_urls") or [])[:6],
                "source_count": c.get("source_count", 1),
                "tags": c.get("tags", []),
                "needs_review": c.get("needs_review", False),
                "raw_titles": c.get("raw_titles", []),
            }
        )

    names = skill_player_names(team.abbrev.upper())
    usage_window, usage_by_name = latest_week_usage_players(team.abbrev.upper())
    story_arcs = build_story_arcs(
        topic_clusters, names, usage_by_name, usage_window
    )
    play_sit_payoffs = build_play_sit_payoffs(
        topic_clusters, names, usage_by_name, usage_window
    )
    game_box = build_game_box(team, usage_window, usage_by_name)
    for cluster in topic_clusters:
        cluster.pop("content_dates", None)

    injuries = _fetch_skill_injuries(team.abbrev.upper())

    out: dict[str, Any] = {
        "team_slug": team.slug,
        "week_label": recap_label(weekly_issue_date),
        "topic_clusters": topic_clusters,
    }
    if game_box:
        out["game_box"] = game_box
    if story_arcs:
        out["story_arcs"] = story_arcs
    if play_sit_payoffs:
        out["play_sit_payoffs"] = play_sit_payoffs
    if injuries:
        out["injury_status"] = injuries
    return out


def build_league_weekly_input(
    weekly_issue_date: date,
    slug_to_id: dict[str, str],
) -> dict[str, Any]:
    content_start, content_end = content_dates_for_week(weekly_issue_date)
    raw = fetch_raw_items_for_range(content_start, content_end)
    normalized = _normalize(raw, slug_to_id)
    league_items = extract_league_feed_items(normalized)
    clusters = cluster_league_feed(league_items, limit=200)
    clusters.sort(key=lambda c: -len(c.get("content_dates") or []))

    topic_clusters = []
    for c in clusters[:MAX_LEAGUE_CLUSTERS]:
        content_dates = c.get("content_dates") or []
        topic_clusters.append(
            {
                "topic_label": (c.get("canonical_title") or "")[:140],
                "summary_seed": (c.get("summary_seed") or "")[:400],
                "day_count": len(content_dates) or 1,
                "day_labels": _day_labels(content_dates),
                "source_urls": (c.get("source_urls") or [])[:3],
                "tags": c.get("tags", []),
            }
        )

    return {
        "week_label": recap_label(weekly_issue_date),
        "topic_clusters": topic_clusters,
    }
