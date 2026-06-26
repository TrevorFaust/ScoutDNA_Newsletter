"""Parse podcasts_grid.tsv -> podcasts_registry.csv (names only; add RSS later)."""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GRID = ROOT / "podcasts_grid.tsv"
OUT = ROOT / "podcasts_registry.csv"

TEAM_SLUGS = [
    "buffalo-bills",
    "miami-dolphins",
    "new-england-patriots",
    "new-york-jets",
    "baltimore-ravens",
    "cincinnati-bengals",
    "cleveland-browns",
    "pittsburgh-steelers",
    "houston-texans",
    "indianapolis-colts",
    "jacksonville-jaguars",
    "tennessee-titans",
    "denver-broncos",
    "kansas-city-chiefs",
    "las-vegas-raiders",
    "los-angeles-chargers",
    "dallas-cowboys",
    "new-york-giants",
    "philadelphia-eagles",
    "washington-commanders",
    "chicago-bears",
    "detroit-lions",
    "green-bay-packers",
    "minnesota-vikings",
    "atlanta-falcons",
    "carolina-panthers",
    "new-orleans-saints",
    "tampa-bay-buccaneers",
    "arizona-cardinals",
    "los-angeles-rams",
    "san-francisco-49ers",
    "seattle-seahawks",
]


def classify(name: str) -> str:
    n = name.lower()
    if "locked on" in n:
        return "locked_on"
    if "official" in n or "(official" in n:
        return "official"
    if "chat sports" in n:
        return "chat_sports"
    return "independent"


def short_name(cell: str) -> str:
    """First segment before em dash."""
    cell = cell.strip()
    if not cell:
        return ""
    return cell.split("—")[0].split(" - ")[0].strip()[:120]


def main() -> None:
    if not GRID.is_file():
        raise SystemExit(f"Missing {GRID}")
    lines = GRID.read_text(encoding="utf-8").splitlines()
    rows_out: list[dict] = []
    for line_no, line in enumerate(lines[1:], start=2):
        if not line.strip():
            continue
        cells = line.split("\t")
        for col, slug in enumerate(TEAM_SLUGS):
            if col >= len(cells):
                continue
            raw = cells[col].strip()
            if not raw:
                continue
            name = short_name(raw)
            if not name:
                continue
            rows_out.append(
                {
                    "team_slug": slug,
                    "podcast_name": name,
                    "category": classify(raw),
                    "rss_url": "",
                    "notes": raw[:500] if len(raw) > len(name) else "",
                }
            )

    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["team_slug", "podcast_name", "category", "rss_url", "notes"],
        )
        w.writeheader()
        w.writerows(rows_out)

    by_team: dict[str, int] = {}
    for r in rows_out:
        by_team[r["team_slug"]] = by_team.get(r["team_slug"], 0) + 1
    print(f"Wrote {len(rows_out)} podcast rows to {OUT}")
    print(f"Teams: {len(by_team)}; per team min={min(by_team.values())} max={max(by_team.values())}")


if __name__ == "__main__":
    main()
