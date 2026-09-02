# Where to find every API key

Copy values into **`.env`** at the project root (same folder as `README.md`) — not `Untitled` or `.env.example`.  
The pipeline only reads `.env`. In VS Code/Cursor: open your env file → **File → Save As** → name it `.env`.

Also copy the **same** Supabase URL + anon key into `web/.env.local` for the website.

---

## Supabase (4 values — really 3 unique)

1. Open [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click your project
3. Left sidebar: **Project Settings** (gear icon at bottom)
4. Click **API**

| .env variable | Where on that page |
|---------------|-------------------|
| `SUPABASE_URL` | **Project URL** — e.g. `https://abcdefgh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project API keys** → `anon` `public` — click reveal/copy |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project API keys** → `service_role` `secret` — click reveal/copy |

**Important**

- `anon` = safe for the browser (Next.js)
- `service_role` = full database access — **never** commit or put in client code; only pipeline + server publish route

### Run migrations (one time)

1. In Supabase: **SQL Editor** → **New query**
2. Paste and run each file in order:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_seed_teams.sql`
   - `supabase/migrations/003_policies.sql`
3. **Table Editor** → you should see `teams` with 32 rows

---

## Anthropic (Claude)

1. [console.anthropic.com](https://console.anthropic.com/)
2. **API Keys** → Create key
3. Paste into `.env` as `ANTHROPIC_API_KEY=sk-ant-api03-...`

---

## Reddit (default: RSS — no API app)

Collect uses **public RSS feeds** for `r/nfl` plus all 32 team subs in `data/teams.json`. You only need a descriptive user agent in `.env`:

```env
REDDIT_USER_AGENT=ScoutDNA-All32/1.0 (contact: your@email.com)
```

No client id, secret, or Node/snoowrap script required. Re-run `.\collect.ps1` after setting that line.

Optional **JSON API** (same data, needs app): set `REDDIT_USE_JSON=true` and add keys below.

## Reddit API keys (optional)

Reddit blocks anonymous `.json` hot feeds (403). For JSON/OAuth instead of RSS, add a **script** app:

1. Log in at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) (use the account you want tied to the bot).
2. Scroll to **“create another app…”** (or **create app**).
3. Choose **script** (not “web app”).
4. Name: `ScoutDNA-All32` (anything).
5. **redirect uri:** `http://localhost:8080` (required but unused for script apps).
6. Click **create app**. Under the app name you’ll see:
   - **client id** — the short string under “personal use script” (not the secret label).
   - **secret** — labeled “secret”.
7. Put these in the repo root `.env`:

```env
REDDIT_CLIENT_ID=your_14_char_id
REDDIT_CLIENT_SECRET=your_secret
REDDIT_USER_AGENT=ScoutDNA-All32/1.0 (contact: your@email.com)
```

`REDDIT_USER_AGENT` must include a real contact email. Restart the terminal after saving `.env`.

---

## External drafts (Reddit + Substack)

After review, the admin page can create **drafts only** on Reddit (per team sub) and Substack. Full walkthrough: [`docs/EXTERNAL_DRAFTS.md`](docs/EXTERNAL_DRAFTS.md).

Add to **`web/.env.local`**:

```env
EXTERNAL_DRAFTS_ENABLED=true
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USER_AGENT=DraftDNA-Newsletter/1.0 (by /u/you; contact: you@email.com)
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
SUBSTACK_PUBLICATION_URL=https://trevorfaust.substack.com
SUBSTACK_CONNECT_SID=connect.sid_value_from_browser
```

---

## Resend (skip for now)

Leave blank until Phase 2 email.

---

## Example `.env` (filled shape)

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

ANTHROPIC_API_KEY=sk-ant-api03-...

REDDIT_USER_AGENT=ScoutDNA-All32/1.0 (contact: you@example.com)

NEWSLETTER_TIMEZONE=America/Los_Angeles
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`web/.env.local` minimum:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Optional: `ANTHROPIC_API_KEY` in `web/.env.local` enables **Reject rumor → Rewrite Talk** in the review UI. Without it, use remove or manual edit.

---

## Test commands (after `.env` + migrations)

```powershell
cd pipeline
.\.venv\Scripts\activate
pip install tzdata
python -m src.run_collect --date 2026-05-19
python -m src.run_compose --date 2026-05-19 --team buffalo-bills
```

Issue URL: `http://localhost:3000/issue/2026-05-19`
