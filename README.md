# ScoutDNA: All 32

**Every team. Every day of collecting. One digest a week worth opening.**

ScoutDNA: All 32 is a weekly NFL digest for people who draft skill players and still read the beat notes. Reddit threads, beat RSS, YouTube shows, and podcasts get collected every day. Compose runs on Tuesday: the prior Tuesday through Monday rolled into one recap so Thursday-Monday games are in, all 32 franchises, plus a league opener. A one-off daily edition is there when a news day is too big to wait.

You get what moved, who said it, and what it does to your roster, with a citation on the claim.

### Inside an issue

| Layer | What you get |
|-------|----------------|
| **League lens** | National stories: schedule, league office, anything with traction beyond one fan base |
| **Team sections (×32)** | Intro, then **Activity** (new facts, earned quotes, rumor beats), then **Fantasy lens** (QB / RB / WR / TE / team DEF so-what only) |
| **Footnotes** | Superscript citations back to Reddit posts, RSS, transcripts. No orphan claims. |

The site chips player names by position from the roster registry. Coaches get staff color. Named reporters land as Other. Depth charts, draft capital, curated position battles, camp momentum, and weekly usage (snap / rush / target share) go into compose so copy tracks a real room.

Fantasy copy stays in standard formats. Individual defensive players are scheme news, not stash targets. Team DEF is the unit you can draft; when it comes up, the lens puts a tier on it.

### How the pipeline runs

```
Collect → Cluster → Compose → Review → Publish
   ↑         ↑          ↑         ↑
 Reddit    Dedupe     Draft +   Rumors, then
 RSS       by team    citations site / drafts
 YouTube
 Podcasts
```

1. **Collect.** Pulls a 24-hour window per team (team subs, r/nfl, ESPN RSS, optional YouTube transcripts and podcast show notes). Runs every day, all year. Camp-signal extraction and the nflverse refresh run on the same cadence.
2. **Compose.** Clusters related items and writes the league opener plus each team block from those sources, with rumor flags built in. Tuesday only for the full 32-team draft (after the 3am usage sync), so Anthropic spend stays on the recap that matters.
3. **Review.** Draft lands in `in_review`. Clear `review:rumor` flags team by team. Approve camp-battle proposals if the reporting earned a slot change.
4. **Publish.** HTML on the Next.js site. After rumors clear, you can create **Substack and Reddit drafts** from the review page. Those are drafts only. Nothing posts live until you hit send yourself.

Scheduled GitHub Actions (and/or a local Windows Task Scheduler job) run collect + media every day. Compose fires on Tuesday after nflverse sync unless you override it.

### Live now (camp / preseason 2026)

- **Uniform team shape.** Intro + Activity + Fantasy lens on every club. Talk is gone. Quotes that name a starter, injury, or role fold into Activity (or the intro if they are the lead).
- **Skill usage.** nflverse weekly stats and snap counts sync into `player_week_usage`. Game scores and yards allowed land in `team_week_results`. Regular-season compose leads with those boxes. `/admin/usage` is the board.
- **Injuries.** ESPN's injury board syncs into `player_injury_status` (`.\scripts\sync_injuries.ps1`, also before weekly compose) and feeds `injury_status` into team prompts for Week N exits and Week N+1 availability.
- **Camp signals.** Daily extract → rolling slot scores → battle *proposals*. Nothing writes to `fantasy_position_battles` until you approve it at `/admin/camp-signals`.
- **Rumor queue.** `/admin/rumors` lists editions with pending flags. `/admin/review/{slug}` is confirm / reject without reading the whole issue first.
- **External drafts.** Review page can open a Substack draft and Reddit drafts aimed at each team subreddit. Flag: `EXTERNAL_DRAFTS_ENABLED`. Setup: [docs/EXTERNAL_DRAFTS.md](./docs/EXTERNAL_DRAFTS.md).
- **nflverse context.** Rosters, depth, coaching, draft capital, and usage refresh on a daily Action (`.github/workflows/sync_nflverse.yml`). Local: `.\scripts\sync_nflverse.ps1`.
- **Position battles.** Editorial seed in `data/fantasy_position_battles_2026.csv` (settled vs contested vs open). Compose reads that map next to DraftDNA depth order.
- **Team archive.** `/team/{slug}` keeps a club's sections across issues. Public site also has Daily, Weekly, and a team directory.

### Editor loop

1. Tuesday draft hits `/admin/review/{slug}` (weekly slugs look like `2026-09-22-weekly`).
2. Clear rumors. Reject can strip or rewrite the beat; approve clears the badge.
3. Check `/admin/usage` if a preseason line or snap share is about to go in copy.
4. Check `/admin/camp-signals` if a WR2 or RB2 fight has enough days of the same direction to propose a settle.
5. **Approve & publish** for the site, then **Create Substack + Reddit drafts** if you want those queues filled.

`web/.env.local` needs `SUPABASE_SERVICE_ROLE_KEY` for review, usage, and camp admin.

### Stack at a glance

- **Python pipeline:** collectors, clustering, compose, nflverse / ESPN usage, camp signals, Supabase storage
- **Next.js web:** public issues, team archives, rumor / usage / camp admin, draft export
- **Supabase:** shared DraftDNA DB (`paveh`): teams, raw items, drafts, published issues, usage, signals

**URL slug:** `scoutdna-all-32` (e.g. `/issue/2026-08-24-weekly`)

**API keys:** [SETUP_KEYS.md](./SETUP_KEYS.md) for Supabase / Anthropic / Reddit.

## Quick start

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com), or use the shared DraftDNA database.
2. Run migrations. See [supabase/migrations/README.md](./supabase/migrations/README.md) (standalone vs shared).
3. Copy keys into `.env` ([SETUP_KEYS.md](./SETUP_KEYS.md) and `.env.example`).

### 2. Python pipeline

Commands use the `src` package inside **`pipeline/`**. Running from the project root without `cd pipeline` causes `No module named 'src'`.

**Option A: helper scripts (run from project root):**

```powershell
cd "path\to\nfl_newsletter"
.\scripts\collect.ps1
.\scripts\compose.ps1 -Team pittsburgh-steelers
.\scripts\compose_weekly.ps1
.\scripts\sync_nflverse.ps1
```

**Option B: from `pipeline` folder (Python, one terminal):**

```powershell
# Prompt: ...\nfl_newsletter\pipeline>
.\.venv\Scripts\activate
python -m src.verify_connection
python -m src.run_collect
python -m src.run_compose --team pittsburgh-steelers
python -m src.run_compose_weekly
python -m src.run_sync_nflverse
```

**Option C: from `pipeline` folder (wrappers to root scripts):**

```powershell
.\verify.ps1
.\collect.ps1
.\compose.ps1 -Team pittsburgh-steelers
```

If you see `scripts\verify.ps1 not recognized`, you are in `pipeline\` but used `.\scripts\`. Run `cd ..` first, or use Option B/C.

One-time setup: `cd pipeline`, `python -m venv .venv`, `pip install -r requirements.txt`, `pip install tzdata`, copy `..\.env` keys.

### 3. Web (review + public issues)

```bash
cd web
npm install
cp ..\.env.example .env.local
npm run dev
```

- Public issue: `http://localhost:3000/issue/2026-08-24-weekly`
- Review draft: `http://localhost:3000/admin/review/2026-08-24-weekly`
- Rumors: `http://localhost:3000/admin/rumors`
- Usage: `http://localhost:3000/admin/usage`
- Camp signals: `http://localhost:3000/admin/camp-signals`

### 4. Reddit (RSS)

Collect uses public RSS feeds for `r/nfl` and team subreddits. Set a descriptive user agent in `.env`:

```env
REDDIT_USER_AGENT=ScoutDNA-All32/1.0 (contact: your@email.com)
```

Optional JSON/OAuth instead of RSS: create a [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) **script** app and set `REDDIT_*` keys. See [SETUP_KEYS.md](./SETUP_KEYS.md). Reddit *draft export* is a separate personal-account setup in [docs/EXTERNAL_DRAFTS.md](./docs/EXTERNAL_DRAFTS.md).

### 5. Daily pipeline (automatic)

Each morning the job **collects** and **ingests media**, every day, all year. It **composes** a draft on **Tuesdays after the 3am PT nflverse sync** (Week N recap of the prior Tuesday through Monday, including Monday Night Football). Other days store raw items. The Tuesday issue lands in **`in_review`**.

**Timing:** 1:00 AM Pacific the day after the collection date. Example: June 30 at 1am collects issue date `2026-06-29`. Sunday issue dates are included (the old Monday hijack skipped them). On Tuesday morning, that 1am run also collects today so MNF talk is in; weekly compose waits for the 3am usage sync. Review at `/admin/review/2026-09-22-weekly`.

**Windows Task Scheduler (this PC):**

```powershell
cd "path\to\nfl_newsletter"
.\scripts\register_collect_task.ps1

# Test once:
Start-ScheduledTask -TaskName "ScoutDNA-daily-collect"
```

Sources each run: **Reddit**, **ESPN RSS**, **YouTube** (all 32), **podcasts**, camp signal extraction. **Weekly compose is Tuesday only**, after nflverse usage sync. Collect-only (never compose): `register_collect_task.ps1 -SkipCompose`.

Want a one-off **daily** edition on a non-Monday (a trade, a starter named, a camp fight that broke)? Run `.\scripts\daily_collect.ps1 -DailyCompose`, or `.\scripts\compose.ps1 -Date 2026-06-30` against an already-collected date.

Logs: `logs/daily_collect_YYYY-MM-DD.log`. Manual run: `.\scripts\daily_collect.ps1`.

**GitHub Actions** backup (when this PC is off): `.github/workflows/collect.yml` collects daily (including Sundays), extracts camp signals, and refreshes the battle proposal queue. `.github/workflows/sync_nflverse.yml` syncs boxes at 3am PT and composes weekly on Tuesday. Pass `force_daily_compose: true` on a manual collect `workflow_dispatch` to get a full daily edition on any date. Secrets: `SUPABASE_*`, `REDDIT_USER_AGENT`, `ANTHROPIC_API_KEY`.

Daily nflverse sync is its own Action: `.github/workflows/sync_nflverse.yml`.

## Repo layout

```
pipeline/          # Collect, dedupe, LLM compose, nflverse/usage, camp signals
web/               # Next.js: issues, team archives, admin, draft export
supabase/          # SQL migrations
data/              # Team registry, source seeds, battles CSV
docs/              # Setup notes (YouTube, camp signals, external drafts, …)
.github/workflows/ # Scheduled collect + nflverse sync
```

## More setup

| Topic | Doc |
|-------|-----|
| API keys | [SETUP_KEYS.md](./SETUP_KEYS.md) |
| YouTube transcripts | [docs/YOUTUBE_SETUP.md](./docs/YOUTUBE_SETUP.md) |
| Camp signal layer | [docs/CAMP_SIGNAL_LAYER.md](./docs/CAMP_SIGNAL_LAYER.md) |
| Depth, battles, stats DB | [docs/DATA_INTEGRATION.md](./docs/DATA_INTEGRATION.md) |
| Substack + Reddit drafts | [docs/EXTERNAL_DRAFTS.md](./docs/EXTERNAL_DRAFTS.md) |
| Shared DraftDNA database | [docs/SHARED_DATABASE.md](./docs/SHARED_DATABASE.md) |

## Roadmap

- **Shipping:** Reddit + RSS + media collect, Tuesday weekly compose, review UI, HTML publish, team archives, usage board, camp-signal proposals, rumor queue, Substack/Reddit draft export
- **Next:** Resend email, subscriber preferences
- **Later:** Glossary tooltips, more media sources
