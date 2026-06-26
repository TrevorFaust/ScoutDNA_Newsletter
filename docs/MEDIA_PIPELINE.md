# Daily media: YouTube + podcasts

## Saved catalog

- `data/podcasts_registry.csv` — **146 RSS feeds** (your curated list)
- `data/youtube_sources.csv` — **199 channels**
- Rebuild podcast CSV after edits: `python data/build_podcasts_rss_csv.py`

## Daily Steelers test (copy-paste)

```powershell
cd "C:\Users\trevo\Desktop\Personal Projects\Coding\Fantasy Data\nfl_newsletter\pipeline"
.\.venv\Scripts\activate

# Reddit RSS + site RSS (REDDIT_USER_AGENT in .env only)
.\collect.ps1 -Date 2026-05-29

# YouTube + podcasts (new episodes in 24h window only)
.\media.ps1 -Date 2026-05-29 -Team pittsburgh-steelers -MaxVideos 1 -MaxEpisodes 1

# Write newsletter section
.\compose.ps1 -Date 2026-05-29 -Team pittsburgh-steelers
```

## What each step does

| Step | Checks | Text stored |
|------|--------|-------------|
| **YouTube** | New uploads per channel (videos/streams/podcasts tabs) | Captions first, else Whisper |
| **Podcasts** | New RSS episodes in issue window | Show notes by default; optional full audio transcript |
| **Football filter** | Drops paragraphs about NBA/MLB/NHL/etc. | Applied before saving to `newsletter_raw_items` |
| **Compose** | Clusters all sources | One Steelers section |

## Full audio podcast transcripts

Default: **RSS title + description** (fast, good for daily).

For full MP3 + Whisper (slow):

```env
PODCAST_TRANSCRIBE=true
```

Requires `pip install -r requirements-youtube.txt` (Whisper + torch).

## Volume caps (required at scale)

```env
YOUTUBE_MAX_VIDEOS_PER_CHANNEL=2
PODCAST_MAX_EPISODES_PER_FEED=2
```

## All 32 teams (parallel, not sequential)

Sequential one-team media × 32 ≈ many hours. Run **6 workers** (tune 4–8):

```powershell
.\media_batch.ps1 -Date 2026-05-29 -AllTeams -Workers 6 -MaxVideos 1 -MaxEpisodes 1
```

Rough wall-clock with low caps: **~45–90 minutes** for all teams (network + YouTube rate limits), not all day.

Suggested daily split:

1. `collect.ps1` — all teams, ~2–4 min (RSS is fast).
2. `media_batch.ps1 -AllTeams` — parallel ingest.
3. Compose still per-team or full compose (API cost); run compose in batches of 4 divisions if needed.

Stop a stuck run: **Ctrl+C** in the PowerShell window (may take a few seconds while yt-dlp finishes a request).
