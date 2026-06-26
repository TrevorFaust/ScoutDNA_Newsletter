"""One-off: parse youtube_channels_grid.tsv -> youtube_sources.csv"""

import csv
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
GRID = ROOT / "youtube_channels_grid.tsv"
OUT = ROOT / "youtube_sources.csv"

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

TAB_SUFFIXES = ("/videos", "/streams", "/podcasts", "/featured")


def normalize_url(url: str) -> str:
    url = url.strip()
    if not url:
        return ""
    if url.startswith("youtube.com"):
        url = "https://www." + url
    if not url.startswith("http"):
        if "youtube.com" in url:
            url = "https://www." + url.lstrip("/")
    return url.split("?")[0].rstrip("/")


def channel_label(url: str) -> str:
    path = urlparse(url).path.strip("/")
    if path.startswith("@"):
        return path.split("/")[0]
    if path.startswith("c/"):
        return path.split("/")[1] if len(path.split("/")) > 1 else path
    if path.startswith("channel/"):
        return "channel"
    return path or "youtube"


def detect_tab(url: str) -> str:
    for s in TAB_SUFFIXES:
        if url.endswith(s):
            return s.lstrip("/")
    return "all"


def tier_for_url(url: str, label: str) -> int:
    lower = (url + label).lower()
    official_markers = (
        "/@patriots",
        "/@buffalobills",
        "/@browns",
        "/@steelers",
        "/@jaguars",
        "/@broncos",
        "/@eagles",
        "/@packers",
        "/@vikings",
        "/@bengals",
        "/@chargers",
        "/@commanders",
        "/@nyjets",
        "/@nygiants",
        "/ravens",
        "/dolphins",
        "/texans",
        "/chiefs",
        "/raiders",
        "/cowboys",
        "/bears",
        "/lions",
        "/falcons",
        "/saints",
        "/buccaneers",
        "/seahawks",
        "/49ers",
        "/cardinals",
        "/rams",
        "steelertv",
        "ravens tv",
    )
    if any(m in lower for m in official_markers):
        return 1
    if "lockedon" in lower:
        return 2
    return 2


def main() -> None:
    lines = GRID.read_text(encoding="utf-8").splitlines()
    rows_out: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for line in lines[1:]:
        if not line.strip():
            continue
        cells = line.split("\t")
        for col, slug in enumerate(TEAM_SLUGS):
            if col >= len(cells):
                continue
            raw = cells[col].strip()
            if not raw or not ("youtube.com" in raw or raw.startswith("http")):
                continue
            url = normalize_url(raw)
            if "youtube.com" not in url:
                continue
            key = (slug, url.lower())
            if key in seen:
                continue
            seen.add(key)
            label = channel_label(url)
            tab = detect_tab(url)
            rows_out.append(
                {
                    "team_slug": slug,
                    "channel_url": url,
                    "label": label,
                    "source_tier": tier_for_url(url, label),
                    "tab": tab,
                    "expand_tabs": "true" if tab == "all" else "false",
                }
            )

    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "team_slug",
                "channel_url",
                "label",
                "source_tier",
                "tab",
                "expand_tabs",
            ],
        )
        w.writeheader()
        w.writerows(sorted(rows_out, key=lambda r: (r["team_slug"], r["label"])))

    by_team: dict[str, int] = {}
    for r in rows_out:
        by_team[r["team_slug"]] = by_team.get(r["team_slug"], 0) + 1
    print(f"Wrote {len(rows_out)} channels to {OUT}")
    print(f"Teams with channels: {len(by_team)}; min={min(by_team.values())} max={max(by_team.values())}")


if __name__ == "__main__":
    main()
