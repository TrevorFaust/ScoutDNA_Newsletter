# YouTube channel list — review flags

Generated from your grid → `youtube_sources.csv` (**167 channels**, all 32 teams, 3–8 per team).

## Looks good

- Mix of **official team channels**, **Locked On–style pods**, and **beat/local shows** is what we want.
- URLs with `/videos`, `/streams`, or bare `@handle` are fine — ingest expands bare handles to **videos + streams + podcasts** tabs automatically.
- Duplicate **same URL** in the sheet was deduped (e.g. Seahawks fan channel listed twice).

## Fix or verify before podcasts/reporters

| Team | URL / handle | Issue |
|------|----------------|--------|
| **Jaguars** | `@UCF_Jaguar` | Confirmed: Jaguars channel (not UCF college). |
| **Colts** | `youtube.com/c/colts` | Confirmed: official team channel. |
| **Titans** | `youtube.com/titans` | Confirmed: official team channel. |
| **Panthers** | `youtube.com/carolinapanthers` | Missing `https://www.` in sheet — normalized in CSV; verify in browser. |
| **Patriots** | `@nbcsboston` | Regional NBC, not team-owned — OK as tier 2, not official. |
| **Chargers / Jaguars** | — | **7** and **3** YouTube channels respectively in CSV (correct). |

## Feasibility (daily run)

| Topic | Guidance |
|-------|----------|
| **167 channels × 3 tabs** | Listing is cheap; **transcribing** is not. Keep `YOUTUBE_MAX_VIDEOS_PER_CHANNEL=1` or `2` and 24h window. |
| **Podcasts tab** | Not every channel has it; yt-dlp may return empty — harmless. |
| **Streams tab** | Good for live pressers; often duplicates `/videos` — dedupe by video URL (implemented). |
| **Full 32 teams daily** | Run overnight or stagger divisions; Steelers pilot first. |

## Files

- `data/youtube_channels_grid.tsv` — your paste (source of truth)
- `data/youtube_sources.csv` — machine ingest (regenerate: `python data/build_youtube_csv.py`)
- Re-import to Supabase optional: map rows into `sources_registry.csv` with `source_type=youtube`
