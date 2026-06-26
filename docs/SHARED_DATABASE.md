# One PostgreSQL for DraftDNA + ScoutDNA (read/write both ways)

## Is this feasible?

**Yes.** One Postgres server, many apps (DraftDNA, ScoutDNA, DBeaver, pgAdmin). If either app **writes** a row, the other can **read** it immediately (same tables, same schema).

pgAdmin and DBeaver do **not** store your data. They are **clients** that connect to the same server Supabase (or your host) runs.

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  DraftDNA   │     │  ScoutDNA   │     │ DBeaver /    │
│  (Vite app) │     │  newsletter │     │ pgAdmin      │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘
       │                   │                    │
       └───────────────────┼────────────────────┘
                           ▼
                 ┌─────────────────────┐
                 │  ONE PostgreSQL DB   │
                 │  (one host + db name)│
                 └─────────────────────┘
```

## What you have today (likely)

You may have **two Supabase projects** (two separate databases):

- `msfhpjfhrtzmhxyjoldp` — newsletter Supabase project  
- `pavehsrhmpoexcqoighb` — DraftDNA Supabase project  

DBeaver probably connects to **one** of them via **Database → Connection string**. That is the database DraftDNA “reads from.” ScoutDNA will only see DraftDNA writes if ScoutDNA connects to **that same** database—not the other Supabase project.

## What you need to decide

**Pick one database** as the single source of truth:

| Choice | Action |
|--------|--------|
| **A. Use DraftDNA’s DB** (`paveh…`) | Point ScoutDNA `.env` at **paveh** Supabase URL + keys; run newsletter migrations in **that** project’s SQL Editor / DBeaver |
| **B. Use newsletter’s DB** (`msfhp…`) | Point DraftDNA at **msfhp**; migrate DraftDNA tables there |
| **C. Use a non-Supabase Postgres** | Both apps use the same `DATABASE_URL` from your host; ScoutDNA may need more code changes if it only uses `supabase-js` today |

Until both apps use the **same** host + database name, they are **not** sharing data.

---

## Get connection info from DBeaver (you already have it)

1. Open **DBeaver** → **Database Navigator** → your existing connection.  
2. Right-click → **Edit Connection**.  
3. Note on the **Main** tab:
   - **Host**
   - **Port** (often `5432` or Supabase pooler `6543`)
   - **Database**
   - **Username**
   - **Password** (click show, or use Supabase reset)

4. **SSL:** Supabase requires SSL (tab **SSL** → use SSL mode).

**Connection URI shape:**

```text
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Supabase also shows this under:

**Dashboard → your project → Project Settings → Database → Connection string → URI**

Use the **same** project in the dashboard as the one DBeaver connects to.

---

## Get API keys (for ScoutDNA web + pipeline today)

The newsletter app uses the **Supabase JavaScript client** (HTTP API), not DBeaver directly.

From **the same Supabase project** DBeaver uses:

**Project Settings → API**

| Key | Env var (newsletter) |
|-----|----------------------|
| Project URL | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` |
| anon public | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role secret | `SUPABASE_SERVICE_ROLE_KEY` |

Put the same three in `web/.env.local`.

DraftDNA already has the equivalent as `VITE_SUPABASE_URL`, etc.—those must be the **same URL** as above if you want one database.

---

## Wire ScoutDNA to the shared DB

### Step 1 — Identify which DB DBeaver uses

In DBeaver: connection name or host often includes `pavehsrhmpoexcqoighb` or `msfhpjfhrtzmhxyjoldp`. That tells you which Supabase project is “the” database.

### Step 2 — Point newsletter `.env` at that project

If DBeaver = **DraftDNA (paveh)** project, set newsletter to:

```env
SUPABASE_URL=https://pavehsrhmpoexcqoighb.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://pavehsrhmpoexcqoighb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from paveh API page>
SUPABASE_SERVICE_ROLE_KEY=<service_role from paveh API page>
```

Then run newsletter migrations in **that** project (SQL Editor or run SQL in DBeaver).

If you keep newsletter on `msfhp` and DraftDNA on `paveh`, they **cannot** see each other’s new rows.

### Step 3 — Direct Postgres URL (pipeline / scripts)

In root `.env` (optional, for `inspect_stats_db` and future stats reads):

```env
DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Copy from **Database → Connection string** (same project as DBeaver).  
Use **Session pooler** or **Direct** as Supabase documents.

Both repos can use the same `DATABASE_URL` for raw SQL.

---

## pgAdmin

Same idea as DBeaver:

1. Register → Server → **Connection** tab → Host, Port, Database, Username, Password.  
2. That server is the same Postgres; use those values in `DATABASE_URL`.  
3. Supabase API keys still come from the dashboard for the JS client.

---

## Read/write both ways (examples)

| Action | Tool | Who sees it |
|--------|------|-------------|
| Insert row in DBeaver | SQL | DraftDNA + ScoutDNA (next query) |
| DraftDNA app insert via Supabase client | API | ScoutDNA if same URL/DB |
| ScoutDNA `run_collect` → `raw_items` | pipeline | DraftDNA if same DB + table visible |
| ScoutDNA migration new table | SQL | DraftDNA if same DB |

Use **one schema** (usually `public`) or separate schemas (`draftdna`, `newsletter`) if you want tidier boundaries—both apps can still read both schemas if granted permissions.

---

## Checklist

- [ ] Confirm which Supabase project DBeaver connects to (`paveh` vs `msfhp`).  
- [ ] Set **both** apps’ Supabase URL + keys to **that** project (or migrate tables into one).  
- [ ] Run ScoutDNA migrations `001`–`003` on that database once.  
- [ ] Add `DATABASE_URL` from DBeaver/Supabase Database settings for Python tools.  
- [ ] Do **not** mix `msfhp` keys with `paveh` database (or vice versa).

---

## After you pick the shared project

Tell us: **“DBeaver uses paveh”** or **“DBeaver uses msfhp”** and we can align migrations and stats table mapping. No passwords in chat—only which project is canonical.
