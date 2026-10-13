"""Dump Week 2 recap for editorial fixes."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.db import get_client

ISSUE = "9bddf85d-8121-4714-9c76-255c9b835392"
OUT = Path(__file__).resolve().parents[1] / "tmp" / "w2_recap_dump.json"
HITS = Path(__file__).resolve().parents[1] / "tmp" / "w2_recap_hits.txt"

NEEDLES = [
    "LaFleur",
    "Cardinals generated",
    "Jeffery Simmons",
    "A.J. Brown",
    "AJ Brown",
    "Commanders",
    "Jayden Daniels",
    "TreVeyon Henderson",
    "Rhamondre",
    "DJ Moore",
    "D.J. Moore",
    "rb_rush_share",
    "Braelon Allen",
    "Tee Higgins",
    "she ",
    "She ",
    "Brock Bowers",
]


def main() -> None:
    sb = get_client()
    issue = (
        sb.table("newsletter_issues")
        .select("id, slug, title, status, league_section, league_footnotes")
        .eq("id", ISSUE)
        .single()
        .execute()
        .data
    )
    rows = (
        sb.table("newsletter_sections")
        .select(
            "id, team_id, intro_paragraphs, activity_markdown, fantasy_markdown, "
            "rookie_paragraph, footnotes"
        )
        .eq("issue_id", ISSUE)
        .execute()
        .data
    )
    teams = {
        t["id"]: t["abbrev"]
        for t in sb.table("newsletter_teams").select("id, abbrev").execute().data
    }
    for r in rows:
        r["abbrev"] = teams.get(r["team_id"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"issue": issue, "sections": rows}, indent=2), encoding="utf-8")

    lines: list[str] = []
    lines.append("==== LEAGUE ====")
    league = issue.get("league_section") or ""
    for n in NEEDLES:
        if n.lower() in league.lower():
            idx = league.lower().find(n.lower())
            lines.append(f"{n}: ...{league[max(0,idx-40):idx+120].replace(chr(10),' | ')}...")
    lines.append("")

    unders: list[str] = []
    for r in sorted(rows, key=lambda x: x.get("abbrev") or ""):
        blob = "\n".join(
            [
                r.get("intro_paragraphs") or "",
                r.get("activity_markdown") or "",
                r.get("fantasy_markdown") or "",
                r.get("rookie_paragraph") or "",
            ]
        )
        hits = []
        for n in NEEDLES:
            if n.lower() in blob.lower():
                idx = blob.lower().find(n.lower())
                snip = blob[max(0, idx - 50) : idx + 110].replace("\n", " | ")
                hits.append(f"{n}: ...{snip}...")
        for m in re.finditer(r"\b[a-z]+(?:_[a-z0-9]+)+\b", blob):
            unders.append(f"{r['abbrev']}: {m.group(0)}")
        if hits:
            lines.append(f"==== {r['abbrev']} ({r['id']}) ====")
            lines.extend(hits)
            lines.append("")

    lines.append("==== UNDERSCORES ====")
    lines.extend(unders or ["(none)"])
    HITS.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT, HITS, "unders", len(unders))


if __name__ == "__main__":
    main()
