"""Weekly opener check. The site ticket shows this lead and stops at a box score.

Keep the stat test in sync with the fan site (NewsTeamWeeklies) and
web/lib/tagline.ts. A weekly edition must not publish if sentence 1 fails.
"""

from __future__ import annotations

import re

# Counting line: PPR, a carry or catch total, a completion line, or N yards.
# Scores (34-22) and records (3-2) do not match.
STAT_LINE = re.compile(
    r"\bPPR\b|\d+\s+carr(?:y|ies)\b|\b(?:caught|catches)\b|\bcompleted\s+\d+"
    r"|\d+\s+of\s+\d+\s+(?:passes|targets|attempts)\b|\d+\s+yards\b"
    r"|\btarget share\b|\bsnap share\b",
    re.I,
)
_ABBREV = re.compile(
    r"(?:\b(?:Jr|Sr|St|Dr|Mr|Ms|No|vs|Inc|Jan|Feb|Aug|Sept?|Oct|Nov|Dec)|\s[A-Z])\.$"
)


def opening_sentences(text: str) -> list[str]:
    """Sentences from the intro, with decimals and initials (J.K.) kept intact."""
    cleaned = re.sub(r"[#>*_`]", "", text or "")
    cleaned = re.sub(r"[\u00b9\u00b2\u00b3\u2070-\u209f]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return []
    shielded = re.sub(r"(\d)\.(\d)", lambda m: f"{m.group(1)}\x00{m.group(2)}", cleaned)
    shielded = re.sub(r"([A-Z])\.(?=[A-Z])", lambda m: f"{m.group(1)}\x01", shielded)
    parts = re.findall(r"[^.!?]+[.!?]+(?:\s|$)", shielded)
    out: list[str] = []
    for part in parts:
        piece = part.replace("\x00", ".").replace("\x01", ".").strip()
        if not piece:
            continue
        if out and _ABBREV.search(out[-1]):
            out[-1] = f"{out[-1]} {piece}"
        else:
            out.append(piece)
    return out


def opening_is_stat_line(text: str) -> bool:
    """True when the first sentence is a box score rather than the game or the week."""
    sentences = opening_sentences(text)
    if not sentences:
        return False
    return STAT_LINE.search(sentences[0]) is not None
