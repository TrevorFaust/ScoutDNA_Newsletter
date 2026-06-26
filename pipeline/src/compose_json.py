"""Robust JSON extraction from Claude compose responses."""

from __future__ import annotations

import json
import re


def parse_compose_json(text: str) -> dict:
    """Parse team/league compose JSON; tolerate preamble and duplicate blocks."""
    text = (text or "").strip()
    if not text:
        raise json.JSONDecodeError("empty response", text, 0)

    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)

    candidates: list[str] = []
    start = 0
    while True:
        idx = text.find("{", start)
        if idx < 0:
            break
        end = text.rfind("}", idx)
        if end > idx:
            candidates.append(text[idx : end + 1])
        start = idx + 1

    if not candidates:
        raise json.JSONDecodeError("no JSON object found", text, 0)

    last_err: json.JSONDecodeError | None = None
    for blob in reversed(candidates):
        try:
            return json.loads(blob)
        except json.JSONDecodeError as err:
            last_err = err
            repaired = _repair_truncated_json(blob)
            if repaired != blob:
                try:
                    return json.loads(repaired)
                except json.JSONDecodeError as err2:
                    last_err = err2
    if last_err:
        raise last_err
    raise json.JSONDecodeError("could not parse compose JSON", text, 0)


def _repair_truncated_json(blob: str) -> str:
    """Close unterminated strings/brackets when the model hits max_tokens."""
    blob = blob.rstrip()
    if blob.endswith("}"):
        return blob
    in_string = False
    escape = False
    stack: list[str] = []
    for ch in blob:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}]" and stack and stack[-1] == ch:
            stack.pop()
    out = blob
    if in_string:
        out += '"'
    out += "".join(reversed(stack))
    return out
