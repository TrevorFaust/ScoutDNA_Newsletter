"""Flag team sections that bold a player who is now on another club's roster."""

from __future__ import annotations

import re
from typing import Any

from .compose_context import _canon_team, usage_team_abbrs
from .db import get_client

_BOLD_RE = re.compile(r"\*\*([^*]+?)\*\*")
_SUFFIX_RE = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?", re.I)
_TITLE_PREFIXES = frozenset({"HC", "OC", "DC", "GM", "QB", "RB", "WR", "TE", "CB", "S", "LB", "LT", "RT", "LG", "RG", "C"})


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
        tokens = raw.split()
        if tokens and tokens[0] in _TITLE_PREFIXES:
            tokens = tokens[1:]
        if len(tokens) < 2:
            continue
        hits = index.get(_key(" ".join(tokens)))
        if not hits or any(_canon_team(h["team_abbr"]) in mine for h in hits):
            continue
        where = ", ".join(sorted({_canon_team(h["team_abbr"]) for h in hits}))
        flags.append(f"review:roster {' '.join(tokens)} is on {where}")
    return flags
