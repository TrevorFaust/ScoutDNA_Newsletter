"""Retry collect and compose after a repair, and only surface a failure after 3 attempts.

GitHub emails when the workflow exits non-zero. Callers must keep going through
attempts 1 and 2, and raise or exit only when the third attempt still fails.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import time
from pathlib import Path

ATTEMPTS = 3
EXHAUSTED_PREFIX = "failed after 3 attempts"

_TRANSIENT_MARKERS = (
    "timeout",
    "timed out",
    "connection reset",
    "connection aborted",
    "connection refused",
    "temporarily unavailable",
    "service unavailable",
    "rate limit",
    "too many requests",
    "overloaded",
    "remoteprotocolerror",
    "apiconnectionerror",
    "apitimeouterror",
    "internalservererror",
    "readtimeout",
    "connecttimeout",
    "connecterror",
    "sslerror",
    "network is unreachable",
    "name or service not known",
    "max retries exceeded",
    "429",
    "500",
    "502",
    "503",
    "504",
    "529",
)

_CODE_BUG_TYPES = (
    "NameError",
    "ImportError",
    "ModuleNotFoundError",
    "AttributeError",
    "SyntaxError",
    "IndentationError",
    "TypeError",
    "KeyError",
    "UnboundLocalError",
    "ZeroDivisionError",
)

_TRACE_FILE_RE = re.compile(r'File "([^"]+)", line (\d+)')
_DIFF_PATH_RE = re.compile(r"^\+\+\+ b/(pipeline/.+\.py)\s*$", re.M)
_LEAK_HIT_RE = re.compile(
    r"^(?P<scope>[a-z0-9-]+)\.(?P<field>[a-z0-9_]+):(?P<token>[a-z0-9_]+)$"
)
_LEAGUE_HIT_RE = re.compile(r"^league:(?P<token>[a-z0-9_]+)$")

PROSE_KEYS = (
    "intro_paragraphs",
    "rookie_paragraph",
    "activity_markdown",
    "talk_markdown",
    "fantasy_markdown",
)


def exhausted_message(label: str, errors: list[str]) -> str:
    last = (errors[-1] if errors else "unknown error").strip()
    if len(last) > 1800:
        last = last[:1800] + "..."
    return f"{EXHAUSTED_PREFIX} ({label}): {last}"


def is_exhausted(text: str) -> bool:
    return EXHAUSTED_PREFIX in (text or "")


def is_transient(text: str) -> bool:
    low = (text or "").lower()
    return any(marker in low for marker in _TRANSIENT_MARKERS)


def looks_like_code_bug(log: str) -> bool:
    if "Traceback (most recent call last)" not in (log or ""):
        return False
    if "snake_case tokens leaked" in log:
        return False
    return any(name in log for name in _CODE_BUG_TYPES)


def forbid_note(tokens: list[str] | None) -> str:
    """Extra compose instruction after a draft leaked internal field names."""
    cleaned = sorted({t.strip() for t in (tokens or []) if t and t.strip()})
    if not cleaned:
        return ""
    listed = ", ".join(cleaned)
    return (
        "\n\nRepair pass (required): the previous draft leaked these internal "
        f"snake_case tokens into reader prose: {listed}. Rewrite each spot in "
        "plain English. Do not output snake_case identifiers, field names, or "
        "flag names anywhere in the JSON strings.\n"
    )


def scrub_section(section: dict) -> None:
    from .compose import scrub_internal_flag_names

    for key in PROSE_KEYS:
        val = section.get(key)
        if isinstance(val, str) and val:
            section[key] = scrub_internal_flag_names(val)


def leak_hits(sections: list[dict], league_text: str | None) -> list[str]:
    from .compose import find_internal_flag_leaks

    hits: list[str] = []
    for sec in sections:
        slug = sec.get("team_slug") or "unknown-team"
        for key in PROSE_KEYS:
            for tok in find_internal_flag_leaks(sec.get(key) or ""):
                hits.append(f"{slug}.{key}:{tok}")
    if league_text:
        for tok in find_internal_flag_leaks(league_text):
            hits.append(f"league:{tok}")
    return hits


def split_leak_hits(hits: list[str]) -> tuple[dict[str, set[str]], set[str]]:
    """Map team slug to leaked tokens, plus league-section tokens."""
    by_slug: dict[str, set[str]] = {}
    league: set[str] = set()
    for hit in hits:
        league_match = _LEAGUE_HIT_RE.match(hit)
        if league_match:
            league.add(league_match.group("token"))
            continue
        team_match = _LEAK_HIT_RE.match(hit)
        if not team_match:
            continue
        by_slug.setdefault(team_match.group("scope"), set()).add(team_match.group("token"))
    return by_slug, league


def run_attempts(label: str, fn, *, attempts: int = ATTEMPTS):
    """Retry transient failures. Other exceptions propagate so a new process can patch code."""
    errors: list[str] = []
    for attempt in range(1, attempts + 1):
        try:
            return fn(attempt)
        except Exception as exc:
            message = str(exc)
            errors.append(message)
            if is_exhausted(message):
                raise
            if not is_transient(message) or attempt == attempts:
                if attempt == attempts and is_transient(message):
                    raise RuntimeError(exhausted_message(label, errors)) from exc
                raise
            print(
                f"[recover] {label} attempt {attempt}/{attempts} failed: {message[:500]}",
                flush=True,
            )
            time.sleep(min(45, 15 * attempt))
    raise RuntimeError(exhausted_message(label, errors))


def repo_root_from_cwd() -> Path:
    cwd = Path.cwd().resolve()
    if (cwd / "src").is_dir() and cwd.name == "pipeline":
        return cwd.parent
    if (cwd / "pipeline" / "src").is_dir():
        return cwd
    return Path(__file__).resolve().parents[2]


def traceback_excerpt(log: str) -> str:
    marker = "Traceback (most recent call last)"
    idx = log.rfind(marker)
    if idx >= 0:
        return log[idx : idx + 8000]
    return log[-4000:]


def files_from_traceback(text: str, root: Path) -> list[tuple[Path, int]]:
    found: list[tuple[Path, int]] = []
    seen: set[Path] = set()
    pipeline_root = (root / "pipeline").resolve()
    for match in _TRACE_FILE_RE.finditer(text or ""):
        raw = match.group(1).replace("\\", "/")
        rel_idx = raw.find("pipeline/")
        if rel_idx < 0:
            continue
        rel = raw[rel_idx:]
        path = (root / rel).resolve()
        try:
            path.relative_to(pipeline_root)
        except ValueError:
            continue
        if path.suffix != ".py" or not path.is_file() or path in seen:
            continue
        seen.add(path)
        found.append((path, int(match.group(2))))
    return found[:3]


def _file_window(path: Path, line: int) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) <= 220:
        start, end = 0, len(lines)
    else:
        start = max(0, line - 90)
        end = min(len(lines), line + 90)
    return "\n".join(f"{i + 1}|{lines[i]}" for i in range(start, end))


def validate_diff(diff: str) -> list[str]:
    """Return pipeline python paths, or raise if the diff is unsafe to apply."""
    if not diff or "--- " not in diff or "+++ " not in diff:
        raise ValueError("model did not return a unified diff")
    if diff.count("\n") > 180:
        raise ValueError("diff is too large")
    paths = _DIFF_PATH_RE.findall(diff)
    if not paths:
        raise ValueError("diff does not touch pipeline python files")
    for path in paths:
        if not path.startswith("pipeline/") or not path.endswith(".py"):
            raise ValueError(f"refusing to patch {path}")
        if ".." in path.split("/"):
            raise ValueError(f"refusing to patch {path}")
    return paths


def extract_diff(text: str) -> str | None:
    if not text:
        return None
    fence = re.search(r"```(?:diff)?\s*\n(.*?)```", text, re.S)
    body = fence.group(1).strip() if fence else ""
    if not body:
        idx = text.find("--- ")
        if idx < 0:
            return None
        body = text[idx:].strip()
    if "NO_PATCH" in text and "--- " not in body:
        return None
    if not body.startswith("---"):
        return None
    return body if body.endswith("\n") else body + "\n"


def propose_code_fix(log: str, root: Path) -> str | None:
    """Ask Claude for a minimal unified diff that fixes a traceback. None if it should not patch."""
    if not looks_like_code_bug(log):
        return None
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("[recover] no ANTHROPIC_API_KEY, skipping code repair", flush=True)
        return None
    excerpt = traceback_excerpt(log)
    files = files_from_traceback(excerpt, root)
    if not files:
        print("[recover] traceback did not point at pipeline python, skipping code repair", flush=True)
        return None

    import anthropic

    from .compose import MODEL

    blocks = []
    for path, line in files:
        rel = path.relative_to(root).as_posix()
        blocks.append(f"FILE {rel} (error near line {line})\n{_file_window(path, line)}")
    prompt = (
        "A scheduled NFL newsletter pipeline failed. Fix the bug in the traceback "
        "with the smallest unified diff that makes this command succeed.\n\n"
        "Rules:\n"
        "- Touch only pipeline/**/*.py files named below.\n"
        "- Do not change prompts, copy, or behavior beyond the crash.\n"
        "- Output one unified diff and nothing else. Paths must look like "
        "`--- a/pipeline/src/file.py` and `+++ b/pipeline/src/file.py`.\n"
        "- If you cannot fix it safely, output exactly NO_PATCH.\n\n"
        f"TRACEBACK:\n{excerpt}\n\n" + "\n\n".join(blocks)
    )
    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text if msg.content else ""
    diff = extract_diff(text)
    if not diff:
        print("[recover] code repair declined to patch", flush=True)
        return None
    validate_diff(diff)
    return diff


def _git_apply(diff: str, root: Path, *, reverse: bool = False) -> None:
    cmd = ["git", "apply", "--whitespace=nowarn"]
    if reverse:
        cmd.append("-R")
    proc = subprocess.run(
        cmd,
        input=diff,
        text=True,
        cwd=root,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "git apply failed").strip()
        raise RuntimeError(detail)


def apply_code_fix(diff: str, root: Path) -> list[str]:
    paths = validate_diff(diff)
    check = subprocess.run(
        ["git", "apply", "--check", "--whitespace=nowarn"],
        input=diff,
        text=True,
        cwd=root,
        capture_output=True,
        check=False,
    )
    if check.returncode != 0:
        detail = (check.stderr or check.stdout or "diff does not apply").strip()
        raise RuntimeError(detail)
    _git_apply(diff, root)
    compile_targets = [str(root / path) for path in paths]
    compiled = subprocess.run(
        [sys.executable, "-m", "py_compile", *compile_targets],
        capture_output=True,
        text=True,
        check=False,
    )
    if compiled.returncode != 0:
        _git_apply(diff, root, reverse=True)
        detail = (compiled.stderr or compiled.stdout or "py_compile failed").strip()
        raise RuntimeError(detail)
    return paths


def revert_code_fix(diff: str, root: Path) -> None:
    _git_apply(diff, root, reverse=True)


def persist_code_fix(paths: list[str], root: Path, label: str) -> None:
    """Commit a repair that already succeeded, when this is the GitHub Actions checkout."""
    if os.getenv("GITHUB_ACTIONS") != "true":
        return
    if not paths:
        return
    env = os.environ.copy()
    env.setdefault("GIT_AUTHOR_NAME", "ScoutDNA recover")
    env.setdefault("GIT_AUTHOR_EMAIL", "41898282+github-actions[bot]@users.noreply.github.com")
    env.setdefault("GIT_COMMITTER_NAME", env["GIT_AUTHOR_NAME"])
    env.setdefault("GIT_COMMITTER_EMAIL", env["GIT_AUTHOR_EMAIL"])
    branch = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    current = (branch.stdout or "").strip()
    if current not in ("main", "master"):
        print(f"[recover] patched files left uncommitted on branch {current or '(detached)'}", flush=True)
        return
    commit = subprocess.run(
        [
            "git",
            "commit",
            "--only",
            "-m",
            f"Fix the {label} failure so the next scheduled run does not stop on the same crash.",
            "--",
            *paths,
        ],
        cwd=root,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if commit.returncode != 0:
        print(f"[recover] could not commit repair: {(commit.stderr or commit.stdout).strip()}", flush=True)
        return
    push = subprocess.run(
        ["git", "push", "origin", f"HEAD:{current}"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if push.returncode != 0:
        print(
            "[recover] repair is committed locally but was not pushed: "
            + (push.stderr or push.stdout or "").strip(),
            flush=True,
        )
        return
    print(f"[recover] pushed code repair for {label}", flush=True)


def run_command(command: list[str], cwd: Path) -> tuple[int, str]:
    proc = subprocess.Popen(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    tail: list[str] = []
    for line in proc.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        tail.append(line)
        if len(tail) > 400:
            tail = tail[-250:]
    code = proc.wait()
    return code, "".join(tail)


def fail_final(label: str, errors: list[str]) -> int:
    message = exhausted_message(label, errors).replace("\r", " ").replace("\n", " ")
    print(message, flush=True)
    if os.getenv("GITHUB_ACTIONS") == "true":
        safe = message.replace("%", "%25")
        print(f"::error::{safe[:4000]}", flush=True)
    return 1


def run_with_recovery(command: list[str], *, label: str, attempts: int = ATTEMPTS) -> int:
    """Run a pipeline command up to 3 times. Exit 1 only after the last failure."""
    root = repo_root_from_cwd()
    cwd = Path.cwd().resolve()
    errors: list[str] = []
    applied: str | None = None
    for attempt in range(1, attempts + 1):
        if attempt > 1:
            print(f"[recover] {label} starting attempt {attempt}/{attempts}", flush=True)
        code, log = run_command(command, cwd)
        if code == 0:
            if applied:
                try:
                    paths = validate_diff(applied)
                    persist_code_fix(paths, root, label)
                except Exception as exc:
                    print(f"[recover] repair ran, commit skipped: {exc}", flush=True)
            if attempt > 1:
                print(f"[recover] {label} succeeded on attempt {attempt}/{attempts}", flush=True)
            return 0

        excerpt = traceback_excerpt(log).strip() or f"exit code {code}"
        errors.append(excerpt)
        print(f"[recover] {label} attempt {attempt}/{attempts} failed", flush=True)
        if is_exhausted(log) or attempt == attempts:
            if applied:
                try:
                    revert_code_fix(applied, root)
                except Exception as exc:
                    print(f"[recover] could not revert failed patch: {exc}", flush=True)
            return fail_final(label, errors)

        if applied:
            try:
                revert_code_fix(applied, root)
            except Exception as exc:
                print(f"[recover] could not revert failed patch: {exc}", flush=True)
            applied = None

        if is_transient(log):
            time.sleep(min(45, 15 * attempt))
            continue

        if looks_like_code_bug(log):
            try:
                diff = propose_code_fix(log, root)
                if diff:
                    apply_code_fix(diff, root)
                    applied = diff
                    print(f"[recover] applied a code repair before attempt {attempt + 1}", flush=True)
            except Exception as exc:
                print(f"[recover] code repair did not apply: {exc}", flush=True)
                applied = None
        time.sleep(5)
    return fail_final(label, errors)
