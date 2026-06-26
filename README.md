# ScoutDNA: All 32

Fantasy-focused daily NFL digest for all 32 teams (ScoutDNA brand), with a Monday weekly rollup.

**URL slug:** `scoutdna-all-32` (e.g. `/issue/2026-05-19`)

**API keys:** see [SETUP_KEYS.md](./SETUP_KEYS.md) for exactly where to copy each value from Supabase / Anthropic / Reddit.

## Quick start

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/001_initial.sql` in the SQL editor.
3. Copy keys into `.env` (see `.env.example`).

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

### 4. Reddit app

Create a "script" app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps). Set `REDDIT_*` in `.env`.

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

## Twitter / X API (later)

X moved to **pay-per-use credits** (no free tier for new devs). Roughly **~$0.005 per post read**; a daily 32-team digest pulling hundreds of posts can land in **$20–100+/month** depending on volume. Legacy fixed tiers (~$200/mo Basic) may still exist for old accounts. Plan to add X in Phase 2 with a monthly cap.

## Phase roadmap

- **Phase 1** (now): Reddit + RSS, compose, review UI, publish HTML
- **Phase 2**: Resend email, Monday weekly job, subscriber preferences
- **Phase 3**: X API, glossary tooltips, team archive pages, podcast transcripts
