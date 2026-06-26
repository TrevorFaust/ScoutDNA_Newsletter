import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "season_context.json"


def load_season_context(slug: str) -> dict | None:
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    entry = raw.get(slug)
    if not entry or slug.startswith("_"):
        return None
    return entry
