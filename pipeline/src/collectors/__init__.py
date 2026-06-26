from .reddit import collect_reddit
from .rss import collect_rss

__all__ = ["collect_reddit", "collect_rss"]

try:
    from .youtube import collect_youtube_for_date
except ImportError:
    collect_youtube_for_date = None  # type: ignore[misc, assignment]
