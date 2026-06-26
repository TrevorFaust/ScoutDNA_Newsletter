import json
from dataclasses import dataclass
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "teams.json"


@dataclass(frozen=True)
class Team:
    slug: str
    abbrev: str
    name: str
    conference: str
    division: str
    division_order: int
    narrative_tier: str
    reddit: str
    keywords: tuple[str, ...]


def load_teams() -> list[Team]:
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    teams: list[Team] = []
    for row in raw:
        name = row["name"]
        abbrev = row["abbrev"].lower()
        nick = name.split()[-1].lower()
        teams.append(
            Team(
                slug=row["slug"],
                abbrev=abbrev,
                name=name,
                conference=row["conference"],
                division=row["division"],
                division_order=row["division_order"],
                narrative_tier=row["tier"],
                reddit=row["reddit"],
                keywords=(abbrev, nick, name.lower(), row["slug"].replace("-", " ")),
            )
        )
    return teams


def division_groups(teams: list[Team]) -> dict[str, list[Team]]:
    order = {"East": 0, "North": 1, "South": 2, "West": 3}
    grouped: dict[str, list[Team]] = {}
    for t in sorted(teams, key=lambda x: (x.conference, order[x.division], x.division_order)):
        key = f"{t.conference} {t.division}"
        grouped.setdefault(key, []).append(t)
    return grouped
