"""Shared helpers for camp signal extraction and aggregation."""

from __future__ import annotations

import os
import re
from datetime import date, timedelta

from .teams import Team, load_teams

SEASON = 2026
DEFAULT_WINDOW_DAYS = int(os.getenv("CAMP_SIGNAL_WINDOW_DAYS", "7"))
EXTRACT_MODEL = os.getenv("CAMP_SIGNAL_MODEL", os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"))

CAMP_KEYWORDS = (
    "camp",
    "practice",
    "ota",
    "otas",
    "minicamp",
    "training camp",
    "depth chart",
    "depth-chart",
    "standout",
    "first-team",
    "first team",
    "rep",
    "reps",
    "snap",
    "snaps",
    "bubble",
    "roster",
    "position battle",
    "competing for",
    "wr1",
    "wr2",
    "wr3",
    "rb1",
    "rb2",
    "qb1",
    "te1",
    "starter",
    "backup",
    "rotation",
)

TIER_MULTIPLIER = {1: 1.5, 2: 1.25, 3: 1.0, 4: 0.75, 5: 0.5}
DIRECTION_SIGN = {"up": 1, "down": -1, "neutral": 0}

# Signals that speak directly to the battle outcome (who's actually winning
# reps/the starting job) count more than generic camp buzz. "camp_rep" covers
# passing "he looked good today" mentions with no depth-chart detail, so it's
# weighted below neutral (1.0) even though it's still a real observation.
# "projection" is a pundit/analyst PREDICTING who will win a battle before
# camp evidence exists -- still counted (speculation into minicamp is
# legitimate signal), but capped well below anything reporting an actual event.
SIGNAL_TYPE_MULTIPLIER = {
    "coach_quote": 1.5,
    "beat_report": 1.25,
    "practice_snap": 1.1,
    "injury": 1.25,
    "camp_rep": 0.8,
    "rumor": 0.5,
    "projection": 0.8,
}

# Predictions should never carry more than a passing-mention strength, even if
# the model (or a retroactively re-tagged row) says otherwise -- enforced here
# so it holds regardless of extraction-time prompt compliance.
PROJECTION_STRENGTH_CAP = 1

# Republished/syndicated coverage of one underlying event (the same beat-writer
# story reappearing across days via RSS/Reddit reposts) should not score like
# N independent confirmations. Full weight goes to the strongest instance of a
# story; near-duplicate repeats only add a small corroboration bonus.
DUPLICATE_STORY_THRESHOLD = 78
DUPLICATE_CORROBORATION_FACTOR = 0.2


def norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def abbrev_to_slug(abbrev: str) -> str | None:
    target = (abbrev or "").upper()
    for team in load_teams():
        if team.abbrev.upper() == target:
            return team.slug
    return None


def slug_to_abbrev(slug: str) -> str | None:
    for team in load_teams():
        if team.slug == slug:
            return team.abbrev.upper()
    return None


def teams_by_abbrev() -> dict[str, Team]:
    return {t.abbrev.upper(): t for t in load_teams()}


def window_bounds(reference: date, window_days: int) -> tuple[date, date]:
    start = reference - timedelta(days=window_days - 1)
    return start, reference


def is_camp_relevant(text: str) -> bool:
    lower = (text or "").lower()
    return any(kw in lower for kw in CAMP_KEYWORDS)


def mentions_any_candidate(text: str, candidates: list[str]) -> bool:
    lower = (text or "").lower()
    for name in candidates:
        full = name.lower()
        if full and full in lower:
            return True
        parts = name.split()
        if len(parts) >= 2:
            last = parts[-1].lower()
            if len(last) >= 4 and re.search(rf"\b{re.escape(last)}\b", lower):
                return True
    return False


def signal_weight(
    direction: str, strength: int, source_tier: int, signal_type: str = "camp_rep"
) -> float:
    sign = DIRECTION_SIGN.get(direction, 0)
    tier = max(1, min(5, source_tier or 3))
    type_mult = SIGNAL_TYPE_MULTIPLIER.get(signal_type, 1.0)
    if signal_type == "projection":
        strength = min(strength, PROJECTION_STRENGTH_CAP)
    return sign * strength * TIER_MULTIPLIER.get(tier, 1.0) * type_mult


def group_duplicate_signals(
    signals: list[dict], *, threshold: int = DUPLICATE_STORY_THRESHOLD
) -> list[list[dict]]:
    """Group signals describing the same underlying story via fuzzy summary
    match, so one republished article doesn't count as multiple confirmations."""
    from thefuzz import fuzz

    groups: list[list[dict]] = []
    for s in signals:
        summary = (s.get("summary") or "").strip().lower()
        placed = False
        for g in groups:
            rep_summary = (g[0].get("summary") or "").strip().lower()
            if summary and rep_summary and fuzz.token_set_ratio(summary, rep_summary) >= threshold:
                g.append(s)
                placed = True
                break
        if not placed:
            groups.append([s])
    return groups


def group_representative(group: list[dict]) -> dict:
    """The strongest signal in a duplicate-story group (used for its
    direction/date/summary when the group is treated as one data point)."""
    return max(
        group,
        key=lambda s: abs(
            signal_weight(
                s.get("direction", "neutral"),
                int(s.get("strength") or 1),
                int(s.get("source_tier") or 3),
                s.get("signal_type", "camp_rep"),
            )
        ),
    )


def score_signal_group(group: list[dict]) -> float:
    """Full weight for a story's strongest instance; diminishing credit for
    republished/duplicate coverage of that same event."""
    weighted = sorted(
        (
            signal_weight(
                s.get("direction", "neutral"),
                int(s.get("strength") or 1),
                int(s.get("source_tier") or 3),
                s.get("signal_type", "camp_rep"),
            )
            for s in group
        ),
        key=abs,
        reverse=True,
    )
    if not weighted:
        return 0.0
    return weighted[0] + sum(w * DUPLICATE_CORROBORATION_FACTOR for w in weighted[1:])


def compute_trend(scores_by_half: tuple[float, float]) -> str:
    """Trend from the *recent* half of the window.

    Older vs newer half deltas were confusing in the admin UI: a player with a
    large positive score from early-window buzz, then a quieter recent half,
    showed as "falling." A player with early negative news and nothing recent
    showed as "rising" (less bad ≠ rising).

    Rising / falling now means recent half is clearly positive / negative.
    """
    _first_half, second_half = scores_by_half
    if second_half >= 2:
        return "rising"
    if second_half <= -2:
        return "falling"
    return "flat"
