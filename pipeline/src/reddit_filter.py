"""Filter Reddit posts to fantasy-relevant NFL news."""

from __future__ import annotations

import re

FLUFF_MARKERS = (
    "latest purchase",
    "my bar",
    "man cave",
    "alarm clock",
    "i made",
    "i built",
    "memorabilia",
    "collection",
    "guitar",
    "jersey i",
    "my jersey",
    "fan art",
    "wallpaper",
    "madden",
    "rate my",
    "look at my",
    "just bought",
    "mail day",
    "tailgate setup",
    "presale gear",
    "throwback",
    "2004 game",
    "2005 game",
    "classic game",
    "highlight reel",
    "wake up to get",
)

NEWS_MARKERS = (
    "ota",
    "minicamp",
    "training camp",
    "signed",
    "signing",
    "contract",
    "extension",
    "trade",
    "traded",
    "release",
    "released",
    "waived",
    "injury",
    "injured",
    "depth chart",
    "starter",
    "starting",
    "roster",
    "restructure",
    "franchise tag",
    "draft",
    "udfa",
    "tryout",
    "workout",
    "suspended",
    "holdout",
    "press conference",
    "media availability",
    "qb battle",
    "quarterback",
)

SKIP_FLAIRS = frozenset(
    s.lower()
    for s in (
        "Meme",
        "Shitpost",
        "Humor",
        "Fan Art",
        "Photo",
        "Picture",
        "Highlight",
        "Highlights",
        "Gameday",
        "Game Thread",
        "Postgame",
        "Tailgate",
        "Merch",
        "Collection",
    )
)

GOOD_FLAIRS = frozenset(
    s.lower()
    for s in (
        "News",
        "Official",
        "Rumor",
        "Injury",
        "Analysis",
        "Fantasy",
        "Camp",
        "Roster",
        "Free Agency",
        "Draft",
    )
)


def _hits(text: str, markers: tuple[str, ...]) -> int:
    lower = text.lower()
    return sum(1 for m in markers if m in lower)


def is_relevant_reddit_post(
    *,
    title: str,
    body: str | None = None,
    flair: str | None = None,
    is_self: bool = True,
) -> bool:
    title = (title or "").strip()
    if len(title) < 12:
        return False

    flair_l = (flair or "").strip().lower()
    if flair_l in SKIP_FLAIRS:
        return False

    combined = f"{title}\n{body or ''}"
    if _hits(combined, FLUFF_MARKERS) >= 1 and _hits(combined, NEWS_MARKERS) == 0:
        return False

    if flair_l in GOOD_FLAIRS:
        return True
    if _hits(combined, NEWS_MARKERS) >= 1:
        return True

    if not is_self and re.search(r"\b(espn|pff|rapsheet|schefter|rapoport|nfl\.com)\b", combined, re.I):
        return True

    if "clearly edited" in combined.lower() or "fake tweet" in combined.lower():
        return False

    return False
