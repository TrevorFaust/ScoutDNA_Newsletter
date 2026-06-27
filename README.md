# ScoutDNA: All 32

**Every team. Every day. One digest worth opening.**

ScoutDNA: All 32 is a daily NFL digest that turns the offseason and in-season noise into a structured, fantasy-aware read — all 32 franchises, one issue, every morning. Reddit threads, beat RSS, YouTube shows, and podcast episodes run through a pipeline that collects, dedupes, and clusters the day’s reporting, then uses automation to help build a cited draft: league-wide opener plus per-team sections grounded in sources. Mondays roll the week into a single recap.

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

1. **Collect** — Pulls a 24-hour window of posts and articles per team (team subreddits, r/nfl, ESPN RSS, optional YouTube transcripts and podcast show notes).
2. **Compose** — Groups related items and shapes the league opener and each team block from clustered sources, with sourcing and rumor flags built in.
3. **Publish** — Finished issues ship as HTML on the Next.js site (email via Resend is Phase 2).

Scheduled GitHub Actions can run collect on a cron; compose is typically batched by team or division to keep runs manageable.

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
