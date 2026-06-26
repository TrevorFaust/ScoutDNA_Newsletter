"""Pre-flight check before running migrations. Usage: python -m src.verify_connection"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()


def ok(msg: str) -> None:
    print(f"  OK  {msg}")


def warn(msg: str) -> None:
    print(f"  WARN  {msg}")


def fail(msg: str) -> None:
    print(f"  FAIL  {msg}")
    sys.exit(1)


def check_env() -> None:
    print("\n=== Environment variables ===")
    url = os.getenv("SUPABASE_URL", "")
    anon = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    db_url = os.getenv("DATABASE_URL", "")

    if not url:
        fail("SUPABASE_URL is missing")
    ok(f"SUPABASE_URL set ({url[:40]}...)")

    if "pavehsrhmpoexcqoighb" in url:
        ok("URL points at DraftDNA / shared project (paveh)")
    elif "msfhpjfhrtzmhxyjoldp" in url:
        warn("URL still points at separate msfhp project — data will NOT match DBeaver/DraftDNA")
    else:
        warn("URL host not recognized — confirm it matches DBeaver")

    if not anon:
        warn("NEXT_PUBLIC_SUPABASE_ANON_KEY missing (web may fail; pipeline OK with service role)")
    else:
        ok("NEXT_PUBLIC_SUPABASE_ANON_KEY set")

    if not service:
        fail("SUPABASE_SERVICE_ROLE_KEY is missing (required for pipeline + admin preview)")
    ok("SUPABASE_SERVICE_ROLE_KEY set")

    if db_url:
        if "pavehsrhmpoexcqoighb" in db_url:
            ok("DATABASE_URL host matches paveh")
        else:
            warn("DATABASE_URL host does not match paveh — compare to DBeaver")
        if "[YOUR-PASSWORD]" in db_url or "PASSWORD" in db_url.upper():
            fail("DATABASE_URL still has a placeholder — paste your real password")
    else:
        warn("DATABASE_URL not set (optional; DBeaver/SQL scripts only)")


def check_supabase_api() -> None:
    print("\n=== Supabase API (service role) ===")
    try:
        from .db import get_client
    except Exception as e:
        fail(f"Cannot load Supabase client: {e}")

    sb = get_client()
    try:
        from .tables import TEAMS

        r = sb.table(TEAMS).select("id", count="exact").limit(1).execute()
        count = r.count if r.count is not None else len(r.data or [])
        if count and count > 0:
            ok(f"Table '{TEAMS}' exists with {count} row(s) — migrations 004-006 applied")
        else:
            ok(f"API works; '{TEAMS}' missing or empty — run migrations 004, 005, 006 next")
    except Exception as e:
        err = str(e).lower()
        if "does not exist" in err or "relation" in err or "42p01" in err:
            ok("API works; newsletter tables not created yet — run migrations next")
        elif "invalid" in err or "jwt" in err or "401" in err:
            fail("API auth failed — check SUPABASE_SERVICE_ROLE_KEY from paveh API page")
        else:
            fail(f"API error: {e}")


def check_postgres_direct() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("\n=== Direct Postgres (skipped — no DATABASE_URL) ===")
        return

    print("\n=== Direct Postgres (DATABASE_URL) ===")
    try:
        import psycopg2
    except ImportError:
        warn("psycopg2 not installed — run: pip install psycopg2-binary")
        return

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute("SELECT current_database(), current_user")
        db, user = cur.fetchone()
        ok(f"Connected as {user} to database {db}")

        cur.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
            LIMIT 30
            """
        )
        tables = [r[0] for r in cur.fetchall()]
        newsletter_tables = {
            "newsletter_teams",
            "newsletter_raw_items",
            "newsletter_issues",
            "newsletter_sections",
        }
        found = newsletter_tables & set(tables)
        if found:
            ok(f"Newsletter tables already present: {', '.join(sorted(found))}")
        else:
            ok(f"Public tables sample ({len(tables)}): {', '.join(tables[:8])}{'...' if len(tables) > 8 else ''}")
            if tables:
                ok("DraftDNA tables visible — shared DB looks right")
            ok("No newsletter tables yet — run migrations 001–003 next")

        cur.close()
        conn.close()
    except Exception as e:
        fail(f"Postgres connection failed: {e}\n  Check password, host db.pavehsrhmpoexcqoighb.supabase.co, sslmode=require")


def main() -> None:
    print("ScoutDNA connection verify (safe — no secrets printed)")
    check_env()
    check_supabase_api()
    check_postgres_direct()
    print("\n=== Done ===")
    print("If all OK/WARN above look right, run migrations 004, 005, 006 (NOT 001-003 on shared DB).")
    print("Then: .\\scripts\\collect.ps1 and compose.ps1\n")


if __name__ == "__main__":
    main()
