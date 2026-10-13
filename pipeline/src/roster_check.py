"""Flag team sections that bold a player who is now on another club's roster."""

from __future__ import annotations

import re
from typing import Any

from .compose_context import _canon_team, usage_team_abbrs
from .db import get_client

_BOLD_RE = re.compile(r"\*\*([^*]+?)\*\*")
_SUFFIX_RE = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?", re.I)
_TITLE_PREFIXES = frozenset({"HC", "OC", "DC", "GM", "QB", "RB", "WR", "TE", "CB", "S", "LB", "LT", "RT", "LG", "RG", "C"})
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
_SIGNING_RE = re.compile(r"\b(sign(s|ed|ing)?|claim(s|ed)?|acquir(e|es|ed)|trade[sd]? for)\b", re.I)


def _key(name: str) -> str:
    return re.sub(r"[^a-z]", "", _SUFFIX_RE.sub("", name.lower()))


def load_roster_index() -> dict[str, list[dict[str, Any]]]:
    sb = get_client()
    rows: list[dict[str, Any]] = []
    while True:
        batch = (
            sb.table("rosters_2026")
            .select("full_name, team_abbr, status")
            .range(len(rows), len(rows) + 999)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
        if len(batch) < 1000:
            break
    index: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        index.setdefault(_key(r["full_name"]), []).append(r)
    return index


def section_roster_flags(
    text: str, team_abbr: str, index: dict[str, list[dict[str, Any]]]
) -> list[str]:
    """review:roster flags for bold names rostered only by other clubs."""
    mine = {_canon_team(a) for a in usage_team_abbrs(team_abbr)}
    flags: list[str] = []
    for raw in dict.fromkeys(_BOLD_RE.findall(text or "")):
        name = _player_name(raw)
        if not name:
            continue
        hits = index.get(_key(name))
        if not hits or any(_canon_team(h["team_abbr"]) in mine for h in hits):
            continue
        where = ", ".join(sorted({_canon_team(h["team_abbr"]) for h in hits}))
        flags.append(f"review:roster {name} is on {where}")

    # A reported signing is not a done deal until the player is on the roster
    # (failed physicals, voided deals).
    for sentence in _SENTENCE_RE.split(text or ""):
        if not _SIGNING_RE.search(sentence):
            continue
        for raw in _BOLD_RE.findall(sentence):
            name = _player_name(raw)
            if not name:
                continue
            hits = index.get(_key(name)) or []
            if any(_canon_team(h["team_abbr"]) in mine for h in hits):
                continue
            flag = f"review:roster {name} signing not on {team_abbr.upper()} roster"
            if flag not in flags:
                flags.append(flag)
    return flags


def _player_name(raw: str) -> str | None:
    tokens = raw.split()
    if tokens and tokens[0] in _TITLE_PREFIXES:
        tokens = tokens[1:]
    return " ".join(tokens) if len(tokens) >= 2 else None
