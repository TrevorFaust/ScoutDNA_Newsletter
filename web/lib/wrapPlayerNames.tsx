import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { PlayerNameChip } from "@/components/PlayerNameChip";
import type { PlayerLookupEntry, PlayerPositionLookup } from "@/lib/playerRegistry";
import { normalizePlayerKey } from "@/lib/positions";

const SUFFIX_TOKENS = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const TOKEN_RE = /^[A-Za-z][A-Za-z'’.-]*/;

/** "J.J." -> "j.j", "Smith." -> "smith" (strip trailing punctuation only). */
function tokenKey(token: string): string {
  return token.toLowerCase().replace(/[.'’-]+$/, "");
}

/** "Verse's" -> "Verse", "Verse." -> "Verse" (case preserved for surname matching). */
function bareToken(token: string): string {
  return token.replace(/['’]s$/, "").replace(/[.'’-]+$/, "");
}

export type ChipMatcher = {
  /** First name token (normalized) -> entries sorted longest displayName first. */
  fullNameIndex: Map<string, PlayerLookupEntry[]>;
  /**
   * Bare surname (exact case, e.g. "Verse") -> player, only for players whose
   * full name appears in the section's context text and whose surname is
   * unambiguous within that context.
   */
  surnames: Map<string, PlayerLookupEntry>;
  byNormalized: Map<string, PlayerLookupEntry>;
};

/** Tracks players already chipped within one paragraph / list item. */
export type ChipSession = { seen: Set<string> };

export function createChipSession(): ChipSession {
  return { seen: new Set() };
}

function buildFullNameIndex(
  lookup: PlayerPositionLookup
): Map<string, PlayerLookupEntry[]> {
  const index = new Map<string, PlayerLookupEntry[]>();
  for (const entry of lookup.byLength) {
    const first = entry.displayName.split(/\s+/)[0];
    if (!first) continue;
    const key = tokenKey(first);
    const bucket = index.get(key);
    if (bucket) bucket.push(entry);
    else index.set(key, [entry]);
  }
  for (const bucket of index.values()) {
    bucket.sort((a, b) => b.displayName.length - a.displayName.length);
  }
  return index;
}

function surnameOf(entry: PlayerLookupEntry): string | null {
  const tokens = entry.displayName.split(/\s+/);
  while (
    tokens.length &&
    SUFFIX_TOKENS.has(tokens[tokens.length - 1].toLowerCase().replace(/\.+$/, ""))
  ) {
    tokens.pop();
  }
  if (tokens.length < 2) return null;
  return tokens[tokens.length - 1];
}

function isWordStart(text: string, i: number): boolean {
  return i === 0 || !/[A-Za-z0-9]/.test(text[i - 1]);
}

function hasBoundaryAfter(text: string, end: number): boolean {
  const next = text[end];
  return !next || !/[A-Za-z0-9]/.test(next);
}

function matchFullNameAt(
  text: string,
  i: number,
  index: Map<string, PlayerLookupEntry[]>
): { entry: PlayerLookupEntry; len: number } | null {
  const slice = text.slice(i);
  const token = TOKEN_RE.exec(slice)?.[0];
  if (!token) return null;
  const bucket = index.get(tokenKey(token));
  if (!bucket) return null;
  const lower = slice.toLowerCase();
  for (const entry of bucket) {
    const name = entry.displayName;
    if (lower.startsWith(name.toLowerCase()) && hasBoundaryAfter(text, i + name.length)) {
      return { entry, len: name.length };
    }
  }
  return null;
}

function collectMentionedEntries(
  text: string,
  index: Map<string, PlayerLookupEntry[]>
): PlayerLookupEntry[] {
  const found = new Map<string, PlayerLookupEntry>();
  let i = 0;
  while (i < text.length) {
    if (isWordStart(text, i)) {
      const hit = matchFullNameAt(text, i, index);
      if (hit) {
        found.set(hit.entry.normalized, hit.entry);
        i += hit.len;
        continue;
      }
      const token = TOKEN_RE.exec(text.slice(i))?.[0];
      i += token ? token.length : 1;
      continue;
    }
    i++;
  }
  return [...found.values()];
}

/**
 * Build a matcher for one section. contextText should be the concatenated
 * markdown of the whole team section so a bare "Verse" in the fantasy bullets
 * can resolve to Jared Verse named in the intro.
 */
export function buildChipMatcher(
  lookup: PlayerPositionLookup,
  contextText: string
): ChipMatcher {
  const fullNameIndex = buildFullNameIndex(lookup);
  const surnames = new Map<string, PlayerLookupEntry>();
  const ambiguous = new Set<string>();
  for (const entry of collectMentionedEntries(contextText, fullNameIndex)) {
    const surname = surnameOf(entry);
    if (!surname || ambiguous.has(surname)) continue;
    const existing = surnames.get(surname);
    if (existing && existing.normalized !== entry.normalized) {
      surnames.delete(surname);
      ambiguous.add(surname);
      continue;
    }
    surnames.set(surname, entry);
  }
  return { fullNameIndex, surnames, byNormalized: lookup.byNormalized };
}

function matchAt(
  text: string,
  i: number,
  matcher: ChipMatcher
): { entry: PlayerLookupEntry; len: number; display: string } | null {
  const full = matchFullNameAt(text, i, matcher.fullNameIndex);
  if (full) {
    return { entry: full.entry, len: full.len, display: text.slice(i, i + full.len) };
  }
  const token = TOKEN_RE.exec(text.slice(i))?.[0];
  if (!token) return null;
  const bare = bareToken(token);
  const entry = matcher.surnames.get(bare);
  if (entry && hasBoundaryAfter(text, i + bare.length)) {
    // Bare surname on first mention renders the full name in the chip.
    return { entry, len: bare.length, display: entry.displayName };
  }
  return null;
}

export function wrapTextWithPlayerChips(
  text: string,
  matcher: ChipMatcher,
  session: ChipSession
): ReactNode {
  if (!text || matcher.fullNameIndex.size === 0) return text;

  const nodes: ReactNode[] = [];
  let plainStart = 0;
  let i = 0;
  let key = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) {
      nodes.push(<Fragment key={`t-${key++}`}>{text.slice(plainStart, end)}</Fragment>);
    }
  };

  while (i < text.length) {
    if (isWordStart(text, i)) {
      const hit = matchAt(text, i, matcher);
      if (hit) {
        if (!session.seen.has(hit.entry.normalized)) {
          session.seen.add(hit.entry.normalized);
          flushPlain(i);
          nodes.push(
            <PlayerNameChip
              key={`p-${key++}`}
              name={hit.display}
              position={hit.entry.position}
            />
          );
          i += hit.len;
          plainStart = i;
          continue;
        }
        // Already chipped in this block: leave as plain text.
        i += hit.len;
        continue;
      }
      const token = TOKEN_RE.exec(text.slice(i))?.[0];
      i += token ? token.length : 1;
      continue;
    }
    i++;
  }
  flushPlain(text.length);

  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}

export function extractTextContent(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextContent).join("");
  if (children && typeof children === "object" && "props" in children) {
    const props = (children as { props?: { children?: ReactNode } }).props;
    return extractTextContent(props?.children ?? "");
  }
  return "";
}

function resolveExactName(text: string, matcher: ChipMatcher): PlayerLookupEntry | null {
  const direct = matcher.byNormalized.get(normalizePlayerKey(text));
  if (direct) return direct;
  if (!/\s/.test(text)) {
    return matcher.surnames.get(bareToken(text)) ?? null;
  }
  return null;
}

function renderStrong(
  el: ReactElement,
  matcher: ChipMatcher,
  session: ChipSession
): ReactNode {
  const raw = extractTextContent((el.props as { children?: ReactNode }).children);
  const text = raw.trim();
  const entry = text ? resolveExactName(text, matcher) : null;
  if (!entry) return el;
  if (session.seen.has(entry.normalized)) {
    // Repeat mention: drop the bold so only the first mention stands out.
    return raw;
  }
  session.seen.add(entry.normalized);
  const isBareSurname = normalizePlayerKey(text) !== entry.normalized;
  return (
    <PlayerNameChip
      name={isBareSurname ? entry.displayName : text}
      position={entry.position}
    />
  );
}

export function renderChildrenWithPlayerChips(
  children: ReactNode,
  matcher: ChipMatcher,
  session: ChipSession
): ReactNode {
  if (typeof children === "string") {
    return wrapTextWithPlayerChips(children, matcher, session);
  }
  if (Array.isArray(children)) {
    return children.map((child, idx) => (
      <Fragment key={idx}>
        {renderChildrenWithPlayerChips(child, matcher, session)}
      </Fragment>
    ));
  }
  if (isValidElement(children) && children.type === "strong") {
    return renderStrong(children, matcher, session);
  }
  return children;
}
