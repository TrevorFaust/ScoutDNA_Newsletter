"""List tables in STATS_DATABASE_URL — run: python -m src.inspect_stats_db"""
import os

from dotenv import load_dotenv

load_dotenv()


def main() -> None:
    url = os.getenv("STATS_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        print("Set STATS_DATABASE_URL in .env (postgresql://...)")
        return

    try:
        import psycopg2
    except ImportError:
        print("Run: pip install psycopg2-binary")
        return

    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
        """
    )
    rows = cur.fetchall()
    print(f"Found {len(rows)} tables:\n")
    for schema, name in rows:
        print(f"  {schema}.{name}")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
