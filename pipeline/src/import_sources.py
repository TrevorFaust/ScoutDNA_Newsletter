"""Import data/sources_registry.csv into newsletter_sources."""

import argparse
import csv
from pathlib import Path

from .config import ROOT
from .db import get_client
from .tables import SOURCES, TEAMS


def import_csv(path: Path, *, dry_run: bool = False) -> None:
    sb = get_client()
    teams = {r["slug"]: r["id"] for r in sb.table(TEAMS).select("id, slug").execute().data or []}
    inserted = updated = skipped = 0

    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            url = (row.get("url") or "").strip()
            label = (row.get("label") or "").strip()
            stype = (row.get("source_type") or "").strip().lower()
            if not url or not label or not stype:
                skipped += 1
                continue
            if stype == "broadcast":
                stype = "rss"
            team_slug = (row.get("team_slug") or "").strip()
            team_id = teams.get(team_slug) if team_slug else None
            if team_slug and not team_id:
                print(f"skip unknown team_slug: {team_slug} ({label})")
                skipped += 1
                continue
            tier = int(row.get("tier") or 2)
            active = (row.get("active") or "true").strip().lower() in ("1", "true", "yes")
            payload = {
                "team_id": team_id,
                "source_type": stype,
                "label": label,
                "url": url,
                "tier": tier,
                "active": active,
            }
            if dry_run:
                print(payload)
                continue
            existing = (
                sb.table(SOURCES)
                .select("id")
                .eq("url", url)
                .limit(1)
                .execute()
            )
            if existing.data:
                sb.table(SOURCES).update(payload).eq("id", existing.data[0]["id"]).execute()
                updated += 1
            else:
                sb.table(SOURCES).insert(payload).execute()
                inserted += 1

    print(f"Done: inserted={inserted} updated={updated} skipped={skipped}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file",
        type=str,
        default=str(ROOT / "data" / "sources_registry.csv"),
        help="CSV path (default: data/sources_registry.csv)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    path = Path(args.file)
    if not path.is_file():
        raise SystemExit(f"Missing {path} — copy sources_registry.example.csv")
    import_csv(path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
