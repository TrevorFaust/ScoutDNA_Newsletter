# Daily sources: catalog, firehose, and newsletter

You have hundreds of feeds across 32 teams. The setup is **not** “check every video every day and write a summary.” It is:

1. **Catalog** — one row per source (channel, podcast RSS, reporter feed).
2. **Daily ingest** — each morning, pull only **new** items in the issue’s 24h window.
3. **Firehose** — `newsletter_raw_items` = running stream of everything you captured.
4. **Daily issue** — compose merges that day’s items into **one coherent team section** (plus league block).

Not every source posts daily. Many sources × “only what’s new today” = enough signal.

---

## Three layers (mental model)

| Layer | Table | What it is |
|-------|--------|------------|
| **Catalog** | `newsletter_sources` | Your master list: Steelers YouTube #1, DK podcast, etc. |
| **Stream** | `newsletter_raw_items` | Every new article/post/video transcript you ingested (dated `content_date`). |
| **Edition** | `newsletter_issues` + `newsletter_sections` | The readable newsletter for one date (after compose). |

**Running list of changes** → query `newsletter_raw_items` (newest first).  
**Current news stream** → same table, filtered to last 24–48h and optionally by team.  
**Published digest** → issue page after compose.

---

## What to give the project (one-time)

Use **one spreadsheet**, export to CSV: `data/sources_registry.csv`.

| Column | Example | Notes |
|--------|---------|--------|
| `team_slug` | `pittsburgh-steelers` | Empty = league-wide |
| `source_type` | `youtube` / `podcast` / `rss` / `reddit` | See below |
| `label` | `Steelers Official` | Display name |
| `url` | channel or **RSS feed** URL | Not individual videos |
| `tier` | `1` | 1 = must-check daily, 3 = nice-to-have |
| `active` | `true` | Turn off dead feeds |
| `max_per_day` | `2` | Max **new** items to fully process per source per day |

**Do not** maintain a list of individual videos/episodes — ingest discovers those.

### Source types

| Type | URL you store | Daily behavior |
|------|----------------|----------------|
| `reddit` | (optional) | Already covered by `data/teams.json` → `r/{subreddit}` |
| `youtube` | Channel / `@handle` | List uploads since window → captions/Whisper → `raw_items` |
| `podcast` / `rss` | **RSS feed URL** (Apple often links to feed) | New episodes in window → title + show notes in `body` |
| `twitter` | (later) | Account/list ID when you add X API |

**Reporters:** use `rss` if they have a feed; otherwise site-specific (later) or X when added.

Import catalog into Supabase:

```powershell
cd "C:\Users\trevo\Desktop\Personal Projects\Coding\Fantasy Data\nfl_newsletter\pipeline"
.\.venv\Scripts\activate
python -m src.import_sources --file "..\data\sources_registry.csv"
```

---

## Daily schedule (Pacific)

| Time | Step | Command |
|------|------|---------|
| ~8:00 AM | Ingest text/social | `.\collect.ps1` |
| ~8:15 AM | YouTube (heavy; can run on a PC with GPU) | `.\youtube.ps1 -Date YYYY-MM-DD` |
| ~8:45 AM | (Optional) Podcast RSS from registry | `.\collect.ps1` after RSS wired to registry* |
| ~9:00 AM | Compose all teams (or review Steelers first) | `.\compose.ps1 -Date YYYY-MM-DD` |
| ~10:00 AM | Publish after review | Web admin |

\*Today: RSS is ESPN global + your registry import; extending `run_collect` to read all `podcast`/`rss` rows from `newsletter_sources` is the next code step.

Replace `YYYY-MM-DD` with **issue date** (the date on the newsletter), not “yesterday.”

**Full day (Steelers test):**

```powershell
cd "C:\Users\trevo\Desktop\Personal Projects\Coding\Fantasy Data\nfl_newsletter\pipeline"
.\.venv\Scripts\activate
.\collect.ps1 -Date 2026-05-22
.\youtube.ps1 -Date 2026-05-22 -MaxVideos 2
.\compose.ps1 -Date 2026-05-22 -Team pittsburgh-steelers
```

---

## Volume: you cannot Whisper everything

Rough scale: 32 teams × ~6 YouTube × 5 podcasts ≈ **350+ sources**.

Rules that keep this sane:

1. **Only process publishes inside the 24h content window** (already enforced for Reddit; same for YouTube/RSS).
2. **`max_per_day` per source** — e.g. 2 YouTube transcriptions per channel; skip older hot uploads.
3. **Captions before Whisper** — most pressers have auto-captions.
4. **Podcasts** — default: ingest RSS **title + description** only; full Whisper only for tier-1 shows or episodes &lt; 45 min (policy you set).
5. **Tier 3 sources** — check weekly or only when tier-1/2 found nothing (phase 2).

---

## Rollout order

1. **Catalog** — finish `sources_registry.csv` for **Steelers only**; import; dry-run one day.
2. **YouTube** — 3–7 Steelers channels, `-MaxVideos 2`, one issue composed.
3. **Podcasts** — add RSS URLs for Steelers; extend collect to loop `newsletter_sources` where `source_type in ('rss','podcast')`.
4. **Expand** — duplicate rows for all 32 teams; keep `max_per_day` conservative.
5. **Stream UI** — admin page listing `raw_items` last 48h (future); until then use Supabase Table Editor or SQL.

---

## “Stream” queries (Supabase SQL)

Last 48 hours, all teams:

```sql
select collected_at, title, source_type, content_date
from newsletter_raw_items
where collected_at > now() - interval '48 hours'
order by collected_at desc
limit 100;
```

One team (replace slug with team id from `newsletter_teams`):

```sql
select r.collected_at, r.title, r.source_type, r.url
from newsletter_raw_items r
where r.team_ids @> array[(select id from newsletter_teams where slug = 'pittsburgh-steelers')]::uuid[]
  and r.content_date >= current_date - 1
order by r.collected_at desc;
```

---

## What you should do next

1. Build **`data/sources_registry.csv`** from your spreadsheet (channels + **RSS feed URLs** for podcasts, not Apple web pages).
2. Run **`import_sources`** once.
3. Dry run **one team, one date** (commands above).
4. Paste **no secrets** — if you want help validating CSV shape, paste 3 example rows (URLs only).

Reddit for all 32 is already in `teams.json`; you only need extra rows in the registry for YouTube, podcasts, and reporter RSS.
