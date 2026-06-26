"""Parse podcasts_rss_grid.tsv (32 teams × name/url pairs per row) -> podcasts_registry.csv."""

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GRID = ROOT / "podcasts_rss_grid.tsv"
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

URL_RE = re.compile(r"^https?://", re.I)


def short_name(cell: str) -> str:
    cell = cell.strip()
    if not cell or URL_RE.match(cell):
        return ""
    return cell.split("—")[0].split(" - ")[0].strip()[:120]


def classify(name: str) -> str:
    n = name.lower()
    if "locked on" in n:
        return "locked_on"
    if "official" in n or "(official" in n:
        return "official"
    return "independent"


def parse_grid() -> list[dict]:
    lines = [ln for ln in GRID.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if not lines:
        return []
    header_cells = lines[0].split("\t")
    # 64 cols = name+url pairs; 32 cols = one cell per team per row
    paired = len(header_cells) >= 64 or (lines[1:] and len(lines[1].split("\t")) >= 64)

    rows_out: list[dict] = []
    pending_name: dict[int, str] = {}

    for line in lines[1:]:
        cells = line.split("\t")
        if paired:
            for i, slug in enumerate(TEAM_SLUGS):
                name_idx = i * 2
                url_idx = i * 2 + 1
                if url_idx >= len(cells):
                    continue
                name = short_name(cells[name_idx])
                url = cells[url_idx].strip()
                if not name or not URL_RE.match(url):
                    continue
                rows_out.append(
                    {
                        "team_slug": slug,
                        "podcast_name": name,
                        "category": classify(name),
                        "rss_url": url.split("?")[0].rstrip("/") if "omny.fm/shows" in url else url,
                        "notes": "",
                    }
                )
        else:
            for col, slug in enumerate(TEAM_SLUGS):
                if col >= len(cells):
                    continue
                raw = cells[col].strip()
                if not raw:
                    continue
                if URL_RE.match(raw):
                    if col in pending_name:
                        rows_out.append(
                            {
                                "team_slug": slug,
                                "podcast_name": pending_name[col],
                                "category": classify(pending_name[col]),
                                "rss_url": raw,
                                "notes": "",
                            }
                        )
                        del pending_name[col]
                else:
                    name = short_name(raw)
                    if name:
                        pending_name[col] = name

    # dedupe by team + rss url
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for r in rows_out:
        key = (r["team_slug"], r["rss_url"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)
    return unique


def main() -> None:
    if not GRID.is_file():
        raise SystemExit(f"Missing {GRID}")
    rows = parse_grid()
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["team_slug", "podcast_name", "category", "rss_url", "notes"],
        )
        w.writeheader()
        w.writerows(rows)

    by_team: dict[str, int] = {}
    for r in rows:
        by_team[r["team_slug"]] = by_team.get(r["team_slug"], 0) + 1
    print(f"Wrote {len(rows)} feeds to {OUT}")
    if by_team:
        print(f"Teams: {len(by_team)}; min={min(by_team.values())} max={max(by_team.values())}")


if __name__ == "__main__":
    main()
