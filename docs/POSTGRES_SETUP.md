# Database setup — one project vs two

**For one shared Postgres used by DBeaver, DraftDNA, and ScoutDNA together, see [SHARED_DATABASE.md](./SHARED_DATABASE.md).**

# Database setup — one project vs two (your situation)

You have **two Supabase projects**:

| App | Project URL |
|-----|-------------|
| **ScoutDNA newsletter** (this repo) | `https://msfhpjfhrtzmhxyjoldp.supabase.co` |
| **DraftDNA** (other repo) | `https://pavehsrhmpoexcqoighb.supabase.co` |

That is normal. Each project is its **own** Postgres database. Data does **not** sync between them unless you build sync or merge later.

---

## Should you merge into one project?

| Keep separate (what you did) | Merge into one Supabase project |
|------------------------------|----------------------------------|
| Newsletter data isolated from DraftDNA | One place for issues + stats + depth charts |
| Can merge later when ready | Simpler: one set of keys, one SQL Editor |
| Need **two** connections to read DraftDNA stats from newsletter | DraftDNA `.env` keys = newsletter keys |

**Recommendation:** Keep separate **for now** since you planned a possible merge later. Use:

- **msfhp…** keys in this repo (newsletter tables only).
- **paveh…** keys only when we wire stats/depth charts from DraftDNA (second env vars below).

When you merge products, pick one project, run migrations there, and point both apps at that URL.

---

## Keys for the **newsletter** project (`msfhpjfhrtzmhxyjoldp`)

Dashboard → project **msfhp…** → **Project Settings** → **API**:

| Dashboard label | Put in newsletter `.env` |
|-----------------|---------------------------|
| Project URL | `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` |
| anon `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

Copy the same three into `web/.env.local` (with `NEXT_PUBLIC_` prefix for the URL and anon key).

**Do not** put DraftDNA’s `paveh…` URL in the newsletter app unless you intend to read that database (wrong project for newsletter issues).

---

## Reading DraftDNA stats while projects stay separate

Add a **second** block in root `.env` (from **pavehsrhmpoexcqoighb** dashboard → API):

```env
# DraftDNA Supabase (read stats / depth charts — optional until wired)
DRAFTDNA_SUPABASE_URL=https://pavehsrhmpoexcqoighb.supabase.co
DRAFTDNA_SUPABASE_SERVICE_ROLE_KEY=<service_role from paveh project>
```

Or use **Settings → Database → Connection string (URI)** from the **paveh** project:

```env
DRAFTDNA_DATABASE_URL=postgresql://postgres.[ref]:[password]@...
```

Pipeline will read stats from DraftDNA and write newsletter rows to **msfhp**.

---

## What to copy from DraftDNA `.env` (only if merging to ONE project)

If you later use **one** project for both apps:

| DraftDNA | Newsletter |
|----------|------------|
| `VITE_SUPABASE_URL` | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |

Right now those values are **different** between `msfhp` and `paveh` — do not mix them.

---

## Where to find these in the Supabase dashboard

1. [supabase.com/dashboard](https://supabase.com/dashboard) → your project  
2. **Project Settings** (gear) → **API**
   - **Project URL** → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`  
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY` (never expose in the browser)

3. **Project Settings** → **Database** (only if you need direct Postgres tools)
   - **Connection string** → URI tab → `postgresql://postgres.[ref]:[YOUR-PASSWORD]@...`
   - Use for: `psql`, DBeaver, `python -m src.inspect_stats_db` with `STATS_DATABASE_URL`
   - Password is the **database password** you set when creating the project (or reset under Database settings)

The **service role key** is not the database password. It is a JWT for the Supabase API.

---

## `web/.env.local` (same values)

```env
NEXT_PUBLIC_SUPABASE_URL=<same as SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same as publishable/anon key>
SUPABASE_SERVICE_ROLE_KEY=<same service role key>
```

---

## Adding tables both apps can use

1. Open **SQL Editor** in that Supabase project.  
2. Run migrations from this repo (`supabase/migrations/001_...`, etc.) if not already run.  
3. Add stats/depth-chart tables in the same project (new migration files in `supabase/migrations/`).  
4. DraftDNA and the newsletter both read/write via the same URL + keys (or direct Postgres URI).

---

## Optional: direct Postgres URL in `.env`

For listing tables from Python:

```env
STATS_DATABASE_URL=postgresql://postgres.[project-ref]:[DB-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Copy from **Settings → Database → Connection string** (URI). Use **Session** or **Transaction** pooler mode as Supabase recommends.

Then:

```powershell
cd pipeline
.\.venv\Scripts\activate
pip install psycopg2-binary
python -m src.inspect_stats_db
```

---

## Checklist

- [ ] Newsletter `.env` uses the **same** Supabase URL/keys as DraftDNA (not a second project unless you want isolation).  
- [ ] `web/.env.local` has the three Supabase vars above.  
- [ ] Migrations applied once in that project.  
- [ ] New stats tables created in **that** project → visible in both apps.
