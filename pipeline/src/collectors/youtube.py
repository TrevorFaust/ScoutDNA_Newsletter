"""YouTube: list recent videos, transcript via captions or Whisper."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

from ..config import ROOT
from ..football_filter import filter_to_football, looks_non_nfl_title
from ..time_window import issue_date_for_content_date, published_in_issue_window

SOURCES_CSV = ROOT / "data" / "youtube_sources.csv"
TMP_ROOT = ROOT / "pipeline" / "tmp" / "youtube"
TAB_SUFFIXES = ("/videos", "/streams", "/podcasts", "/featured")
LISTING_TABS = ("videos", "streams", "podcasts")


def _subprocess_timeout() -> int:
    return int(os.getenv("YOUTUBE_CMD_TIMEOUT_SEC", "120"))


def _run(cmd: list[str], *, cwd: Path | None = None, timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(cwd) if cwd else None,
            check=False,
            timeout=timeout or _subprocess_timeout(),
        )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"timed out after {timeout or _subprocess_timeout()}s") from e


def _whisper_available() -> bool:
    if os.getenv("YOUTUBE_SKIP_WHISPER", "").lower() in ("1", "true", "yes"):
        return False
    try:
        import importlib.util

        return importlib.util.find_spec("whisper") is not None
    except Exception:
        return False


def channel_base(url: str) -> str:
    url = url.rstrip("/")
    for suffix in TAB_SUFFIXES:
        if url.endswith(suffix):
            return url[: -len(suffix)]
    return url


def listing_urls_for_source(source: dict) -> list[str]:
    """List one tab or expand — respects CSV `tab` when expand_tabs is true."""
    url = source["channel_url"].rstrip("/")
    expand = str(source.get("expand_tabs", "true")).lower() in ("1", "true", "yes")
    tab = (source.get("tab") or "all").strip().lower()
    if not expand:
        return [url]
    base = channel_base(url)
    if url != base:
        return [url]
    if tab in LISTING_TABS:
        return [f"{base}/{tab}"]
    if tab == "featured":
        return [f"{base}/featured"]
    return [f"{base}/{t}" for t in LISTING_TABS]


def load_youtube_sources() -> list[dict]:
    if not SOURCES_CSV.is_file():
        return []
    rows: list[dict] = []
    with SOURCES_CSV.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if not row.get("channel_url", "").strip() or row["channel_url"].startswith("#"):
                continue
            raw_slug = (row.get("team_slug") or row.get("team_slugs") or "").strip()
            slugs = [s.strip() for s in raw_slug.split("|") if s.strip()]
            rows.append(
                {
                    "channel_url": row["channel_url"].strip(),
                    "team_slugs": slugs,
                    "label": (row.get("label") or "YouTube").strip(),
                    "source_tier": int(row.get("source_tier") or 2),
                    "expand_tabs": row.get("expand_tabs", "true"),
                    "tab": (row.get("tab") or "all").strip(),
                }
            )
    return rows


def _log_youtube_scope(
    *,
    team_slug: str | None,
    sources: list[dict],
    max_v: int,
) -> None:
    scope = f"team={team_slug}" if team_slug else "all teams"
    print(f"YouTube scope: {scope}, {len(sources)} channel rows, max {max_v} video(s) per channel")
    sys.stdout.flush()


def list_channel_videos(
    channel_url: str,
    *,
    after: date,
    max_videos: int,
) -> list[dict]:
    """Return recent uploads with id, title, url, upload_date."""
    after_str = after.strftime("%Y%m%d")
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--flat-playlist",
        "--dateafter",
        after_str,
        "--playlist-end",
        str(max_videos),
        "-J",
        channel_url,
    ]
    proc = _run(cmd)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "yt-dlp list failed")

    payload = json.loads(proc.stdout)
    entries = payload.get("entries") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        entries = []

    videos: list[dict] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        vid = entry.get("id")
        url = entry.get("url") or entry.get("webpage_url")
        if not url and vid:
            url = f"https://www.youtube.com/watch?v={vid}"
        if not url:
            continue
        if "watch" not in url and vid:
            url = f"https://www.youtube.com/watch?v={vid}"
        title = (entry.get("title") or "").strip() or "YouTube video"
        upload = entry.get("upload_date") or entry.get("release_date")
        published = None
        if upload and len(str(upload)) == 8:
            published = datetime.strptime(str(upload), "%Y%m%d").isoformat()
        videos.append(
            {
                "video_id": vid or hashlib.sha256(url.encode()).hexdigest()[:12],
                "title": title,
                "url": url,
                "published_at": published,
            }
        )
    return videos[:max_videos]


def _vtt_to_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    lines: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("WEBVTT") or "-->" in line or line.isdigit():
            continue
        line = re.sub(r"<[^>]+>", "", line)
        if line and (not lines or lines[-1] != line):
            lines.append(line)
    return "\n".join(lines).strip()


def fetch_captions(video_url: str, work_dir: Path) -> str | None:
    """Download auto/manual English subs without full video."""
    template = str(work_dir / "subs")
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--skip-download",
        "--write-auto-sub",
        "--write-sub",
        "--sub-langs",
        "en.*,en",
        "--sub-format",
        "vtt/best",
        "-o",
        template,
        video_url,
    ]
    proc = _run(cmd, cwd=work_dir)
    if proc.returncode != 0:
        return None
    for path in sorted(work_dir.glob("*.vtt"), key=lambda p: p.stat().st_mtime, reverse=True):
        text = _vtt_to_text(path)
        if len(text) > 80:
            return text
    return None


def transcribe_whisper(audio_path: Path, model: str) -> str:
    out_dir = audio_path.parent
    cmd = [
        sys.executable,
        "-m",
        "whisper",
        str(audio_path),
        "--model",
        model,
        "--output_format",
        "txt",
        "--output_dir",
        str(out_dir),
    ]
    proc = _run(cmd)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "whisper failed")
    txt = audio_path.with_suffix(".txt")
    if txt.is_file():
        return txt.read_text(encoding="utf-8").strip()
    matches = list(out_dir.glob("*.txt"))
    if matches:
        return matches[0].read_text(encoding="utf-8").strip()
    raise RuntimeError("whisper produced no txt file")


def fetch_audio_and_whisper(video_url: str, work_dir: Path, model: str) -> str:
    audio_tpl = str(work_dir / "audio.%(ext)s")
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "-x",
        "--audio-format",
        "mp3",
        "-o",
        audio_tpl,
        video_url,
    ]
    proc = _run(cmd, cwd=work_dir)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "yt-dlp audio download failed")
    audio_files = list(work_dir.glob("audio.*"))
    if not audio_files:
        raise RuntimeError("no audio file after yt-dlp")
    return transcribe_whisper(audio_files[0], model)


def get_transcript(video_url: str, *, model: str) -> tuple[str, str]:
    """Returns (text, method) where method is 'captions' or 'whisper'."""
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    work_dir = Path(tempfile.mkdtemp(prefix="vid-", dir=TMP_ROOT))
    try:
        captions = fetch_captions(video_url, work_dir)
        if captions:
            return captions, "captions"
        if not _whisper_available():
            raise RuntimeError("no captions and Whisper disabled/uninstalled")
        return fetch_audio_and_whisper(video_url, work_dir, model), "whisper"
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def video_to_raw_item(
    video: dict,
    *,
    content_date: date,
    channel_meta: dict,
    transcript: str,
    method: str,
) -> dict:
    issue_date = issue_date_for_content_date(content_date)
    published = video.get("published_at")
    if published and not published_in_issue_window(published, issue_date):
        return None

    url = video["url"]
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    team_label = (channel_meta.get("team_slugs") or [""])[0].replace("-", " ").title()
    body = filter_to_football(transcript[:12000], team_name=team_label or None)
    return {
        "external_id": video.get("video_id"),
        "url": url,
        "url_hash": url_hash,
        "title": video["title"],
        "body": body,
        "author": channel_meta.get("label"),
        "published_at": published,
        "content_date": content_date.isoformat(),
        "source_type": "youtube",
        "source_tier": channel_meta.get("source_tier", 2),
        "flair": method,
        "engagement_score": 0,
        "team_slugs": channel_meta.get("team_slugs") or [],
        "tags": ["youtube", method],
        "metadata": {
            "source_label": channel_meta.get("label"),
            "channel_url": channel_meta.get("channel_url"),
            "transcript_method": method,
            "needs_review": method == "whisper",
        },
    }


def collect_youtube_for_date(
    content_date: date,
    *,
    max_videos_per_channel: int | None = None,
    whisper_model: str | None = None,
    single_url: str | None = None,
    team_slug: str | None = None,
) -> list[dict]:
    max_v = max_videos_per_channel or int(os.getenv("YOUTUBE_MAX_VIDEOS_PER_CHANNEL", "5"))
    model = whisper_model or os.getenv("WHISPER_MODEL", "base")
    items: list[dict] = []
    lookback = content_date - timedelta(days=2)

    if single_url:
        meta = {"channel_url": "", "label": "YouTube", "team_slugs": [], "source_tier": 2}
        text, method = get_transcript(single_url, model=model)
        video = {
            "video_id": "manual",
            "title": f"YouTube ({method})",
            "url": single_url,
            "published_at": content_date.isoformat(),
        }
        row = video_to_raw_item(
            video, content_date=content_date, channel_meta=meta, transcript=text, method=method
        )
        return [row] if row else []

    sources = load_youtube_sources()
    if team_slug:
        sources = [s for s in sources if team_slug in s.get("team_slugs", [])]
        if not sources:
            raise ValueError(f"No YouTube sources for team_slug={team_slug!r}")
    _log_youtube_scope(team_slug=team_slug, sources=sources, max_v=max_v)
    for source in sources:
        print(f"\n  channel: {source['label']}", flush=True)
        seen_video_urls: set[str] = set()
        listing_urls = listing_urls_for_source(source)
        videos: list[dict] = []
        for list_url in listing_urls:
            print(f"  listing {list_url} ...", flush=True)
            try:
                batch = list_channel_videos(list_url, after=lookback, max_videos=max_v)
            except Exception as e:
                print(f"YouTube list failed {source['label']} ({list_url}): {e}")
                continue
            for video in batch:
                if video["url"] in seen_video_urls:
                    continue
                seen_video_urls.add(video["url"])
                videos.append(video)
        videos = videos[:max_v]
        for video in videos:
            if looks_non_nfl_title(video.get("title", "")):
                print(f"  skip (non-NFL title): {video['title'][:60]}")
                continue
            print(f"  transcript: {video['title'][:55]} ...", flush=True)
            try:
                text, method = get_transcript(video["url"], model=model)
            except Exception as e:
                print(f"  skip {video['title'][:50]}: {e}", flush=True)
                continue
            if len(text) < 40:
                print(f"  skip (transcript too short): {video['title'][:50]}")
                continue
            row = video_to_raw_item(
                video,
                content_date=content_date,
                channel_meta=source,
                transcript=text,
                method=method,
            )
            if row:
                items.append(row)
                print(f"  ok [{method}] {video['title'][:60]}")
    return items
