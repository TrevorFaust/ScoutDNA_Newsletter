import os
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

# nfl_newsletter/ (repo root)
ROOT = Path(__file__).resolve().parents[2]
# Load root .env first; pipeline/.env overrides if present
for env_path in (ROOT / ".env", ROOT / "pipeline" / ".env"):
    if env_path.is_file():
        load_dotenv(env_path, override=True)


def env_file_hint() -> str:
    return f"Create {ROOT / '.env'} (copy from .env.example). Keys in 'Untitled' are not loaded."

TZ = ZoneInfo(os.getenv("NEWSLETTER_TIMEZONE", "America/Los_Angeles"))


def content_window_for_issue(issue_date: date) -> tuple[datetime, datetime]:
    """Prior calendar day in PT: midnight to midnight before issue_date."""
    start = datetime(issue_date.year, issue_date.month, issue_date.day, tzinfo=TZ) - timedelta(days=1)
    end = datetime(issue_date.year, issue_date.month, issue_date.day, tzinfo=TZ)
    return start, end


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}. {env_file_hint()}")
    return value
