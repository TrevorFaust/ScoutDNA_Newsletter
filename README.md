# ScoutDNA: All 32

**Every team. Every day of collecting. One digest a week worth opening.**

ScoutDNA: All 32 is a weekly NFL digest that turns the offseason and in-season noise into a structured, fantasy-aware read — all 32 franchises, one issue, every Monday. Reddit threads, beat RSS, YouTube shows, and podcast episodes are collected and clustered every single day so nothing is missed, but the LLM-composed draft — the league-wide opener plus per-team sections grounded in sources — only runs once a week, rolling the prior Monday–Sunday into a single Monday recap. A one-off daily edition can still be composed on demand for any date.

Built for people who follow the league seriously — not hot-take aggregators, but readers who want *what moved*, *what was said*, and *what it means for your roster* without opening twelve tabs.

### What an issue looks like

| Layer | What you get |
|-------|----------------|
| **League lens** | National stories — schedule drops, league office news, scandals with traction beyond one fan base |
| **Team sections (×32)** | Intro, rookie/camp beat, **Activity** (new facts + grounded reads), **Talk** (quotes & rumor context), **Fantasy lens** (skill-position angles only when the news supports them) |
| **Footnotes** | Superscript citations back to Reddit posts, RSS articles, transcripts — no orphan claims |

Depth charts, draft capital, and curated position battles (who’s actually fighting for WR2) feed the compose step so copy stays tied to real roster context, not generic camp filler.

### How the pipeline runs

```
Collect → Cluster → Compose → Publish
   ↑         ↑          ↑
 Reddit    Dedupe     Draft + citations
 RSS       by team
 YouTube
 Podcasts
```

1. **Collect** — Pulls a 24-hour window of posts and articles per team (team subreddits, r/nfl, ESPN RSS, optional YouTube transcripts and podcast show notes). Runs every day, all year.
2. **Compose** — Groups related items and shapes the league opener and each team block from clustered sources, with sourcing and rumor flags built in. Runs once a week (Monday, rolling up the prior Mon–Sun) to keep Anthropic API spend low — this is the only step that calls Claude for a full 32-team draft.
3. **Publish** — Finished issues ship as HTML on the Next.js site (email via Resend is Phase 2).

Scheduled GitHub Actions (and/or a local Windows Task Scheduler job) run collect + media every day; compose only fires on Monday unless explicitly overridden (see below).

### Stack at a glance

- **Python pipeline** — collectors, clustering, compose, Supabase storage
- **Next.js web** — public issue pages, issue tooling, signup/preferences stubs
- **Supabase** — teams, raw items, drafts, published issues

**URL slug:** `scoutdna-all-32` (e.g. `/issue/2026-05-19`)

**API keys:** see [SETUP_KEYS.md](./SETUP_KEYS.md) for exactly where to copy each value from Supabase / Anthropic / Reddit.

## Quick start

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run migrations — see [supabase/migrations/README.md](./supabase/migrations/README.md) (standalone vs shared DraftDNA DB).
3. Copy keys into `.env` (see [SETUP_KEYS.md](./SETUP_KEYS.md) and `.env.example`).

### 2. Python pipeline

Commands use the `src` package inside **`pipeline/`**. Running from the project root without `cd pipeline` causes `No module named 'src'`.

**Option A — helper scripts (easiest, run from project root):**

```powershell
cd "path\to\nfl_newsletter"
.\scripts\collect.ps1
.\scripts\compose.ps1 -Team pittsburgh-steelers
```

**Option B — from `pipeline` folder (Python, one terminal):**

```powershell
# Prompt: ...\nfl_newsletter\pipeline>
.\.venv\Scripts\activate
python -m src.verify_connection
python -m src.run_collect
python -m src.run_compose --team pittsburgh-steelers
```

**Option C — from `pipeline` folder (wrappers to root scripts):**

```powershell
.\verify.ps1
.\collect.ps1
.\compose.ps1 -Team pittsburgh-steelers
```

If you see `scripts\verify.ps1 not recognized`, you are in `pipeline\` but used `.\scripts\` — use `cd ..` first or Option B/C above.

One-time setup: `cd pipeline`, `python -m venv .venv`, `pip install -r requirements.txt`, `pip install tzdata`, copy `..\.env` keys.

### 3. Web (review + public issues)

```bash
cd web
npm install
cp ..\.env.example .env.local
npm run dev
```

- Public issue: `http://localhost:3000/issue/2026-05-19`
- Review draft: `http://localhost:3000/admin/review/2026-05-19`

`web/.env.local` must include `SUPABASE_SERVICE_ROLE_KEY` to preview drafts on the site.

### 4. Reddit (RSS)

Collect uses public RSS feeds for `r/nfl` and team subreddits. Set a descriptive user agent in `.env`:

```env
REDDIT_USER_AGENT=ScoutDNA-All32/1.0 (contact: your@email.com)
```

Optional JSON/OAuth instead of RSS: create a [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) **script** app and set `REDDIT_*` keys — see [SETUP_KEYS.md](./SETUP_KEYS.md).

### 5. Daily pipeline (automatic)

Each morning the job **collects** and **ingests media** — every day, all year, so no reporting is missed. It only **composes** a draft on **Mondays** (the weekly recap of the prior Mon–Sun); other days just store raw items. The Monday issue lands in **`in_review`** so you only approve and publish.

**Timing:** 1:00 AM Pacific the day after the collection date. Example: June 30 at 1am → collects issue date `2026-06-29`. On a Monday morning, that same run also composes the weekly recap → review at `/admin/review/2026-06-29-weekly`. Collect runs first; compose (Monday only) starts as soon as ingest finishes.

**Windows Task Scheduler (this PC):**

```powershell
cd "path\to\nfl_newsletter"
.\scripts\register_collect_task.ps1

# Test once:
Start-ScheduledTask -TaskName "ScoutDNA-daily-collect"
```

Sources each run: **Reddit**, **ESPN RSS**, **YouTube** (all 32), **podcasts**, camp signal extraction — then **weekly compose, Mondays only**. Collect-only (never compose): `register_collect_task.ps1 -SkipCompose`.

Want a one-off **daily** edition on a non-Monday (e.g. a big news day)? Run manually: `.\scripts\daily_collect.ps1 -DailyCompose`, or just `.\scripts\compose.ps1 -Date 2026-06-30` against an already-collected date.

Logs: `logs/daily_collect_YYYY-MM-DD.log`. Manual run: `.\scripts\daily_collect.ps1`.

**GitHub Actions** backup (when PC is off): `.github/workflows/collect.yml` — collects daily, extracts camp signals + refreshes the battle proposal queue daily, composes weekly (Monday only) by default. Pass `force_daily_compose: true` on a manual `workflow_dispatch` run to get a full daily edition on any date. Secrets: `SUPABASE_*`, `REDDIT_USER_AGENT`, `ANTHROPIC_API_KEY`.

## Repo layout

```
pipeline/          # Collect, dedupe, LLM compose (Python)
web/               # Next.js — issues, review, signup stub
supabase/          # SQL migrations
data/              # Team registry, source seeds
.github/workflows/ # Scheduled collect
```

## YouTube transcripts

See [docs/YOUTUBE_SETUP.md](./docs/YOUTUBE_SETUP.md) — **yt-dlp** + **Whisper** (optional extras), channel list in `data/youtube_sources.csv`, run `pipeline/youtube.ps1` before compose.

## Phase roadmap

- **Phase 1** (now): Reddit + RSS, compose, review UI, publish HTML
- **Phase 2**: Resend email, Monday weekly job, subscriber preferences
- **Phase 3**: Glossary tooltips, team archive pages, expanded media sources
