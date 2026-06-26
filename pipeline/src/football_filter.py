"""Drop non-NFL segments and sponsor reads from podcast/video text."""

import re

# Titles that are clearly other sports — skip before downloading transcripts
TITLE_NON_FOOTBALL = (
    "diamondbacks",
    "yankees",
    "dodgers",
    "red sox",
    "mets ",
    "mlb",
    "nba ",
    "knicks",
    "lakers",
    "celtics",
    "nhl",
    "stanley cup",
    "premier league",
    "wnba",
    "pga ",
    "masters tournament",
    "ufc fight",
)

SPONSOR_MARKERS = (
    "sponsored by",
    "brought to you by",
    "use promo code",
    "promo code",
    "discount code",
    "partnered with",
    "thanks to our sponsor",
    "this episode is sponsored",
    "advertisement",
    "sign up at ",
    "visit athleticgreens",
    "athletic greens",
    "betterhelp",
    "draftkings",
    "fanduel",
    "prizepicks",
    "underdog fantasy",
    "manscaped",
    "meundies",
    "raycon",
    "hello fresh",
    "factor meals",
    "nordvpn",
    "expressvpn",
)

# Paragraphs heavy on these (without NFL signals) are dropped
NON_FOOTBALL_MARKERS = (
    "nba",
    "knicks",
    "lakers",
    "celtics",
    "yankees",
    "mets",
    "dodgers",
    "red sox",
    "nhl",
    "hockey",
    "stanley cup",
    "mlb",
    "baseball",
    "mls",
    "soccer",
    "premier league",
    "march madness",
    "ncaa basketball",
    "college basketball",
    "wnba",
    "golf",
    "pga ",
    "masters tournament",
    "ufc",
    "mma ",
)

NFL_SIGNALS = (
    "nfl",
    "football",
    "quarterback",
    "qb ",
    " rb ",
    "wide receiver",
    "tight end",
    "offensive line",
    "defensive",
    "linebacker",
    "cornerback",
    "safety ",
    "ota",
    "minicamp",
    "training camp",
    "depth chart",
    "roster",
    "draft pick",
    "free agency",
    "salary cap",
    "touchdown",
    "interception",
    "press conference",
    "head coach",
    "offensive coordinator",
    "defensive coordinator",
    "super bowl",
    "playoff",
    "wild card",
    "afc ",
    "nfc ",
)


def _marker_hits(text: str, markers: tuple[str, ...]) -> int:
    lower = text.lower()
    return sum(1 for m in markers if m in lower)


def looks_non_nfl_title(title: str) -> bool:
    """Fast pre-check on video/episode title before expensive transcript work."""
    lower = (title or "").lower()
    if _marker_hits(lower, TITLE_NON_FOOTBALL) >= 1:
        nfl = _marker_hits(lower, NFL_SIGNALS)
        if nfl == 0:
            return True
    return False


def _is_sponsor_paragraph(text: str) -> bool:
    lower = text.lower()
    if _marker_hits(lower, SPONSOR_MARKERS) >= 1:
        nfl = _marker_hits(lower, NFL_SIGNALS)
        if nfl <= 1:
            return True
    return False


def filter_to_football(text: str, *, team_name: str | None = None) -> str:
    """
    Remove paragraphs that are clearly about other sports.
    Keeps ambiguous paragraphs; drops only when non-NFL >> NFL signals.
    """
    if not text or len(text) < 80:
        return text

    chunks = re.split(r"\n\s*\n", text)
    kept: list[str] = []
    team_lower = (team_name or "").lower()

    for chunk in chunks:
        c = chunk.strip()
        if len(c) < 40:
            continue
        if _is_sponsor_paragraph(c):
            continue
        non = _marker_hits(c, NON_FOOTBALL_MARKERS)
        nfl = _marker_hits(c, NFL_SIGNALS)
        if team_lower and team_lower.split()[0] in c.lower():
            nfl += 2
        if non >= 2 and nfl == 0:
            continue
        if non >= 1 and nfl == 0 and len(c) < 200:
            continue
        kept.append(c)

    if not kept:
        # fallback: return original if we stripped everything
        return text[:12000]
    return "\n\n".join(kept)[:12000]
