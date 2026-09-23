# Connecting your stats & depth chart database

Planned integration for ScoutDNA: All 32.

## Goals

1. **Historical stats** — accurate season records, playoff results, prior-year context (replace/extend `data/season_context.json`).
2. **Depth charts** — who is WR1, RB1, camp battles (e.g. Johnson vs Dowdle), injected into compose prompts.

## Suggested Supabase tables

```sql
-- Sync from your existing DB or ETL job
create table team_season_summary (
  team_id uuid references teams(id),
  season int not null,
  wins int, losses int, ties int default 0,
  playoff_result text,
  notes text,
  primary key (team_id, season)
);

create table depth_chart_slots (
  team_id uuid references teams(id),
  season int not null,
  position_group text not null,  -- QB, RB, WR, TE
  depth int not null,          -- 1, 2, 3
  player_name text not null,
  player_id text,
  status text,                 -- starter, backup, competition
  updated_at timestamptz default now(),
  primary key (team_id, season, position_group, depth)
);
```

## Pipeline changes (when ready)

1. `fetch_team_context(team_slug, season)` — read from Supabase instead of JSON files.
2. Pass into `_build_team_prompt()` as structured JSON (same slot as `season_context` today).
3. Optional: nightly job refreshes depth charts from your source DB.

## What we need from you

See **[POSTGRES_SETUP.md](./POSTGRES_SETUP.md)** for shared-database setup.

- Add `STATS_DATABASE_URL` to `.env` (your existing DraftDNA Postgres).
- Run `python -m src.inspect_stats_db` from `pipeline/` to list tables.
- Tell us table/column names for stats and depth charts.

Until wired, expand `data/season_context.json` team-by-team as you verify facts.

## Injury status (ESPN)

- Sync: `.\scripts\sync_injuries.ps1` (also runs automatically at the start of `compose_weekly.ps1`).
- Table: `player_injury_status` from ESPN's public injuries API ([espn.com/nfl/injuries](https://www.espn.com/nfl/injuries)).
- Compose gets `injury_status` per team (QB/RB/WR/TE only): status, injury type, return_date, and short notes that often explain in-game exits and next-week availability.
- Official pregame practice sheets remain on [nfl.com/injuries](https://www.nfl.com/injuries/) (`/league/{season}/reg{N}`); ESPN is the primary structured feed for now.

## Skill position battles (QB / RB / WR / TE)

**Problem:** `fantasy_team_depth` lists WR1–WR4 order but does not say *which slot is contested*. Steelers may fight over WR3; Dolphins over WR1; Broncos over WR1 between two studs.

**Solution:** Curate `data/fantasy_position_battles_2026.csv` — one row per slot you care about:

| Column | Meaning |
|--------|---------|
| `team_abbr` | PIT, MIA, DEN, … |
| `position` | QB, RB, WR, TE |
| `slot` | QB1, RB1, WR1, WR3, TE1, … |
| `status` | `settled` \| `contested` \| `open` |
| `candidates` | Pipe-separated names (`A\|B\|C`) |
| `note` | Short editor note for compose |

Sync to Supabase:

```powershell
# After migration 015 on paveh
.\scripts\sync_battles.ps1
```

Compose reads `skill_position_battles` per team. Fill all 32 teams over time; only rows you add are sent to the model.

**Works with:** `fantasy_team_depth` (depth order from DraftDNA) + `skill_position_battles` (your battle map).

**Cascade rule:** When WR2 (or RB2/TE1) is `contested`, losers land on the next slot automatically — do not add a separate row for that fallout unless new names join the fight. Skip slot numbers in labels when needed (WR1 → WR2 battle → WR4 bubble means WR3 is implicit). `build_battles_csv.py` applies this via `apply_cascade()`.

**Source of truth for players:** paveh `rosters_2026` and `fantasy_team_depth` (season `2026`) — teams, depth order, experience. The battles CSV is editorial (who is *fighting* for a slot); candidate names must match the DB. Regenerate with validation:

```powershell
cd pipeline
.\.venv\Scripts\python.exe -m src.build_battles_csv --validate
```
