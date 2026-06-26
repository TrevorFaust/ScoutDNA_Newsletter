"""Parse reporters_grid.tsv -> reporters_registry.csv"""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GRID = ROOT / "reporters_grid.tsv"
OUT = ROOT / "reporters_registry.csv"

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


def parse_name(cell: str) -> tuple[str, str]:
    cell = cell.strip()
    if not cell:
        return "", ""
    if " — " in cell:
        name, rest = cell.split(" — ", 1)
        return name.strip(), rest.strip()
    if " - " in cell:
        name, rest = cell.split(" - ", 1)
        return name.strip(), rest.strip()
    return cell[:80], ""


def main() -> None:
    lines = GRID.read_text(encoding="utf-8").splitlines()
    rows_out: list[dict] = []
    for line_no, line in enumerate(lines[1:], start=2):
        if not line.strip():
            continue
        cells = line.split("\t")
        tier = line_no - 1
        for col, slug in enumerate(TEAM_SLUGS):
            if col >= len(cells):
                continue
            raw = cells[col].strip()
            if not raw:
                continue
            name, desc = parse_name(raw)
            if not name:
                continue
            rows_out.append(
                {
                    "team_slug": slug,
                    "reporter_name": name,
                    "tier": tier,
                    "outlet_notes": desc,
                    "twitter_handle": "",
                    "rss_url": "",
                }
            )

    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "team_slug",
                "reporter_name",
                "tier",
                "outlet_notes",
                "twitter_handle",
                "rss_url",
            ],
        )
        w.writeheader()
        w.writerows(rows_out)

    by = {}
    for r in rows_out:
        by[r["team_slug"]] = by.get(r["team_slug"], 0) + 1
    print(f"Wrote {len(rows_out)} reporter rows; teams={len(by)} min={min(by.values())} max={max(by.values())}")


if __name__ == "__main__":
    main()
