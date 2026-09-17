import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { PlayerNameChip } from "@/components/PlayerNameChip";
import type { PlayerLookupEntry, PlayerPositionLookup } from "@/lib/playerRegistry";
import {
  cleanChipName,
  inferRolesFromContext,
  looksLikePersonName,
  type InferredRoleMap,
} from "@/lib/nameRoleInference";
import { normalizePlayerKey, type FantasyPosition } from "@/lib/positions";
import { getTeamNameLexicon } from "@/lib/teams";

const SUFFIX_TOKENS = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const TOKEN_RE = /^[A-Za-z][A-Za-z'’.-]*/;
/**
 * Football prose / English words that collide with player surnames.
 * Bare tokens in this set never expand to a full player chip.
 */
const SURNAME_STOPWORDS = new Set([
  "battle",
  "battles",
  "best",
  "brown",
  "dart",
  "early",
  "free",
  "green",
  "key",
  "large",
  "little",
  "long",
  "major",
  "minor",
  "power",
  "rock",
  "rush",
  "short",
  "stone",
  "strong",
  "young",
]);
/**
 * Auxiliaries / verbs / common words that collide with player first names.
 * Bare "will" / "drew" must not expand to Will Shipley / Drew Allar.
 */
const FIRST_NAME_STOPWORDS = new Set([
  "bill",
  "bob",
  "can",
  "drew",
  "frank",
  "grant",
  "jack",
  "mark",
  "may",
  "pat",
  "ray",
  "will",
]);

/** "J.J." / "AJ" / "A.J" all compact to "aj" so initialed names still match. */
function tokenKey(token: string): string {
  return token.toLowerCase().replace(/[.'’-]+/g, "");
}

/** "Verse's" -> "Verse", "Verse." -> "Verse" (case preserved for surname matching). */
function bareToken(token: string): string {
  return token.replace(/['’]s$/, "").replace(/[.'’-]+$/, "");
}

export type ChipMatcher = {
  fullNameIndex: Map<string, PlayerLookupEntry[]>;
  surnames: Map<string, PlayerLookupEntry>;
  /** Unambiguous first names for players mentioned in this section (e.g. Tua). */
  firstNames: Map<string, PlayerLookupEntry>;
  /** Unique last names on this section's team (Higgins on HOU → Jayden, not Tee). */
  teamSurnames: Map<string, PlayerLookupEntry>;
  byNormalized: Map<string, PlayerLookupEntry>;
  inferredRoles: InferredRoleMap;
  /** First resolved role for a key wins for the whole section. */
  lockedRoles: Map<string, FantasyPosition>;
};

/** Tracks players already chipped within one paragraph/list-item render. */
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

function firstNameOf(entry: PlayerLookupEntry): string | null {
  const first = entry.displayName.split(/\s+/)[0];
  return first || null;
}

function isWordStart(text: string, i: number): boolean {
  return i === 0 || !/[A-Za-z0-9]/.test(text[i - 1]);
}

function hasBoundaryAfter(text: string, end: number): boolean {
  const next = text[end];
  return !next || !/[A-Za-z0-9]/.test(next);
}

/** "the Washington", "against Houston", "vs. Dallas" — city token is the franchise, not a player. */
const TEAM_CUE_BEFORE_RE =
  /(?:^|[^A-Za-z0-9])(?:the|against|vs\.?|versus|hosted|hosting|visits|visiting|host|visit)\s+$/i;

function nextBareTokenAfter(text: string, end: number): string | null {
  const rest = text.slice(end);
  const space = /^\s+/.exec(rest)?.[0] ?? "";
  const token = TOKEN_RE.exec(rest.slice(space.length))?.[0];
  return token ? bareToken(token) : null;
}

/**
 * Length of an NFL franchise phrase at i, or 0.
 * Prevents "Washington Commanders" from chipping as Malik Washington.
 */
function teamNameLengthAt(text: string, i: number): number {
  const lexicon = getTeamNameLexicon();
  const lower = text.slice(i).toLowerCase();

  for (const name of lexicon.fullNames) {
    if (
      lower.startsWith(name.toLowerCase()) &&
      hasBoundaryAfter(text, i + name.length)
    ) {
      return name.length;
    }
  }

  for (const city of lexicon.cities) {
    if (!lower.startsWith(city) || !hasBoundaryAfter(text, i + city.length)) {
      continue;
    }
    // Multi-word cities ("green bay", "new york") are unambiguous franchise phrases.
    // Single-word cities still need a cue so "Washington" can chip as a player surname.
    if (city.includes(" ") || TEAM_CUE_BEFORE_RE.test(text.slice(0, i))) {
      return city.length;
    }
  }

  const token = TOKEN_RE.exec(text.slice(i))?.[0];
  if (!token) return 0;
  const bare = bareToken(token);
  if (
    lexicon.nicknames.has(bare.toLowerCase()) &&
    hasBoundaryAfter(text, i + bare.length)
  ) {
    return bare.length;
  }
  return 0;
}

/** "Malik Washington Commanders" — player last name glued onto the franchise. */
function isFranchiseMash(
  text: string,
  i: number,
  entry: PlayerLookupEntry,
  nameLen: number
): boolean {
  const surname = surnameOf(entry);
  if (!surname) return false;
  const lexicon = getTeamNameLexicon();
  if (!lexicon.cities.includes(surname.toLowerCase())) return false;
  const next = nextBareTokenAfter(text, i + nameLen);
  if (!next) return false;
  const candidate = `${surname} ${next}`.toLowerCase();
  return lexicon.fullNames.some((n) => n.toLowerCase() === candidate);
}

function matchNameLengthAt(
  text: string,
  i: number,
  displayName: string
): number | null {
  const nameTokens = displayName.split(/\s+/).filter(Boolean);
  if (nameTokens.length === 0) return null;
  let pos = i;
  for (let t = 0; t < nameTokens.length; t++) {
    if (t > 0) {
      const space = /^\s+/.exec(text.slice(pos))?.[0];
      if (!space) return null;
      pos += space.length;
    }
    const tok = TOKEN_RE.exec(text.slice(pos))?.[0];
    if (!tok) return null;
    if (tokenKey(tok) !== tokenKey(nameTokens[t])) return null;
    pos += tok.length;
  }
  if (!hasBoundaryAfter(text, pos)) return null;
  return pos - i;
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
  for (const entry of bucket) {
    const len = matchNameLengthAt(text, i, entry.displayName);
    if (len) return { entry, len };
  }
  return null;
}

function previousToken(text: string, i: number): string | null {
  let j = i;
  while (j > 0 && /\s/.test(text[j - 1])) j--;
  if (j === 0) return null;
  let start = j;
  while (start > 0 && /[A-Za-z'’.]/.test(text[start - 1])) start--;
  const tok = text.slice(start, j);
  return tok || null;
}

function firstNameMatches(entry: PlayerLookupEntry, token: string): boolean {
  const first = firstNameOf(entry);
  return !!first && tokenKey(first) === tokenKey(token);
}

function collectMentionedEntries(
  text: string,
  index: Map<string, PlayerLookupEntry[]>
): PlayerLookupEntry[] {
  const found = new Map<string, PlayerLookupEntry>();
  let i = 0;
  while (i < text.length) {
    if (isWordStart(text, i)) {
      const teamLen = teamNameLengthAt(text, i);
      if (teamLen) {
        i += teamLen;
        continue;
      }
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
 * markdown of the whole team section so a bare "Verse" / "Tua" can resolve.
 * teamAbbr scopes ambiguous last names (Higgins on HOU is Jayden, not Tee).
 */
export function buildChipMatcher(
  lookup: PlayerPositionLookup,
  contextText: string,
  teamAbbr?: string | null
): ChipMatcher {
  const fullNameIndex = buildFullNameIndex(lookup);
  const surnames = new Map<string, PlayerLookupEntry>();
  const firstNames = new Map<string, PlayerLookupEntry>();
  const ambiguousSurname = new Set<string>();
  const ambiguousFirst = new Set<string>();
  const mentioned = collectMentionedEntries(contextText, fullNameIndex);
  const teamKey = normalizeTeamAbbr(teamAbbr);

  for (const entry of mentioned) {
    const surname = surnameOf(entry);
    if (surname) {
      const sKey = tokenKey(surname);
      if (!ambiguousSurname.has(sKey)) {
        const existing = surnames.get(sKey);
        if (existing && existing.normalized !== entry.normalized) {
          const preferred = pickTeamPlayer(existing, entry, teamKey);
          if (preferred) {
            surnames.set(sKey, preferred);
          } else {
            surnames.delete(sKey);
            ambiguousSurname.add(sKey);
          }
        } else {
          surnames.set(sKey, entry);
        }
      }
    }
    const first = firstNameOf(entry);
    if (first) {
      const fKey = tokenKey(first);
      if (!ambiguousFirst.has(fKey)) {
        const existing = firstNames.get(fKey);
        if (existing && existing.normalized !== entry.normalized) {
          firstNames.delete(fKey);
          ambiguousFirst.add(fKey);
        } else {
          firstNames.set(fKey, entry);
        }
      }
    }
  }

  const teamSurnames = buildTeamSurnames(lookup, teamKey);

  const inferredRoles = inferRolesFromContext(contextText);
  const lockedRoles = new Map<string, FantasyPosition>();
  // Registry/DB position always wins. Prefill from every mentioned roster/coach
  // hit so a later weak inference cue cannot flip the badge. Inference only
  // fills names the registry does not know (and uses highest-confidence cue).
  for (const entry of mentioned) {
    lockedRoles.set(entry.normalized, entry.position);
  }
  for (const [key, role] of inferredRoles) {
    if (!lockedRoles.has(key)) lockedRoles.set(key, role);
  }

  return {
    fullNameIndex,
    surnames,
    firstNames,
    teamSurnames,
    byNormalized: lookup.byNormalized,
    inferredRoles,
    lockedRoles,
  };
}

const TEAM_ALIAS: Record<string, string> = { AZ: "ARI", LA: "LAR" };

function normalizeTeamAbbr(abbr?: string | null): string | null {
  if (!abbr?.trim()) return null;
  const upper = abbr.trim().toUpperCase();
  return TEAM_ALIAS[upper] ?? upper;
}

function pickTeamPlayer(
  a: PlayerLookupEntry,
  b: PlayerLookupEntry,
  teamKey: string | null
): PlayerLookupEntry | null {
  if (!teamKey) return null;
  const aTeam = a.teamAbbr ? normalizeTeamAbbr(a.teamAbbr) : null;
  const bTeam = b.teamAbbr ? normalizeTeamAbbr(b.teamAbbr) : null;
  if (aTeam === teamKey && bTeam !== teamKey) return a;
  if (bTeam === teamKey && aTeam !== teamKey) return b;
  return null;
}

function buildTeamSurnames(
  lookup: PlayerPositionLookup,
  teamKey: string | null
): Map<string, PlayerLookupEntry> {
  const map = new Map<string, PlayerLookupEntry>();
  if (!teamKey) return map;
  const otherTeamSurnames = new Set<string>();
  for (const entry of lookup.byLength) {
    const surname = surnameOf(entry);
    if (!surname) continue;
    const sKey = tokenKey(surname);
    const entryTeam = entry.teamAbbr ? normalizeTeamAbbr(entry.teamAbbr) : null;
    if (entryTeam && entryTeam !== teamKey) otherTeamSurnames.add(sKey);
  }
  const ambiguousOnTeam = new Set<string>();
  for (const entry of lookup.byLength) {
    const entryTeam = entry.teamAbbr ? normalizeTeamAbbr(entry.teamAbbr) : null;
    if (entryTeam !== teamKey) continue;
    const surname = surnameOf(entry);
    if (!surname) continue;
    const sKey = tokenKey(surname);
    if (!otherTeamSurnames.has(sKey)) continue;
    if (ambiguousOnTeam.has(sKey)) continue;
    const existing = map.get(sKey);
    if (existing && existing.normalized !== entry.normalized) {
      map.delete(sKey);
      ambiguousOnTeam.add(sKey);
    } else {
      map.set(sKey, entry);
    }
  }
  return map;
}

function matchAt(
  text: string,
  i: number,
  matcher: ChipMatcher
): { entry: PlayerLookupEntry; len: number; display: string } | null {
  if (teamNameLengthAt(text, i) > 0) return null;

  const full = matchFullNameAt(text, i, matcher.fullNameIndex);
  if (full) {
    if (isFranchiseMash(text, i, full.entry, full.len)) return null;
    return { entry: full.entry, len: full.len, display: text.slice(i, i + full.len) };
  }
  const token = TOKEN_RE.exec(text.slice(i))?.[0];
  if (!token) return null;
  const key = tokenKey(bareToken(token));
  if (!key || !hasBoundaryAfter(text, i + bareToken(token).length)) return null;

  const bySurname =
    matcher.surnames.get(key) ?? matcher.teamSurnames.get(key);
  if (bySurname) {
    const prev = previousToken(text, i);
    if (prev && firstNameMatches(bySurname, prev)) {
      // "A.J. Brown" already wrote the first name; do not expand Brown to A.J. Brown.
      return null;
    }
    // Bare "battle" / "young" / "rush" is prose, not a player surname chip.
    if (SURNAME_STOPWORDS.has(key)) return null;
    // "Ed Reed" must not render as "Ed Austin Reed" when only Austin Reed is known.
    if (
      prev &&
      /^[A-Z]/.test(prev) &&
      !SUFFIX_TOKENS.has(tokenKey(prev)) &&
      !firstNameMatches(bySurname, prev)
    ) {
      return null;
    }
    return {
      entry: bySurname,
      len: bareToken(token).length,
      display: bySurname.displayName,
    };
  }
  const byFirst = matcher.firstNames.get(key);
  if (byFirst) {
    // "will" / "drew" / lowercase auxiliaries are never player chips.
    if (FIRST_NAME_STOPWORDS.has(key)) return null;
    if (token[0] !== token[0].toUpperCase()) return null;
    // "Adam Schefter" — next token is a different capitalized surname; do not
    // expand bare Adam into Adam Randall.
    const next = nextBareTokenAfter(text, i + bareToken(token).length);
    if (next) {
      const nextKey = tokenKey(next);
      const playerSurname = surnameOf(byFirst);
      if (
        playerSurname &&
        nextKey !== tokenKey(playerSurname) &&
        !SUFFIX_TOKENS.has(nextKey) &&
        /^[A-Z]/.test(next)
      ) {
        return null;
      }
    }
    return { entry: byFirst, len: bareToken(token).length, display: byFirst.displayName };
  }
  return null;
}

function lockRole(
  matcher: ChipMatcher,
  key: string,
  role: FantasyPosition
): FantasyPosition {
  // Never overwrite: first lock is registry (preferred) or best inference.
  const existing = matcher.lockedRoles.get(key);
  if (existing) return existing;
  // Prefer full registry entry when available even if caller passed inference.
  const registry = matcher.byNormalized.get(key);
  const finalRole = registry?.position ?? role;
  matcher.lockedRoles.set(key, finalRole);
  return finalRole;
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
      const teamLen = teamNameLengthAt(text, i);
      if (teamLen) {
        i += teamLen;
        continue;
      }
      const hit = matchAt(text, i, matcher);
      if (hit) {
        if (!session.seen.has(hit.entry.normalized)) {
          session.seen.add(hit.entry.normalized);
          flushPlain(i);
          const position = lockRole(
            matcher,
            hit.entry.normalized,
            hit.entry.position
          );
          nodes.push(
            <PlayerNameChip
              key={`p-${key++}`}
              name={hit.display}
              position={position}
            />
          );
          i += hit.len;
          plainStart = i;
          continue;
        }
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
  const { name } = cleanChipName(text);
  const direct = matcher.byNormalized.get(normalizePlayerKey(name));
  if (direct) return direct;
  if (!/\s/.test(name)) {
    const key = tokenKey(bareToken(name));
    return (
      matcher.surnames.get(key) ??
      matcher.teamSurnames.get(key) ??
      matcher.firstNames.get(key) ??
      null
    );
  }
  return null;
}

function resolveStrongRole(
  text: string,
  matcher: ChipMatcher
): { name: string; position: FantasyPosition; key: string } | null {
  const { name: cleaned, prefixRole } = cleanChipName(text);
  const person = cleaned || text;
  if (!looksLikePersonName(person) && !looksLikePersonName(text)) return null;

  const entry = resolveExactName(text, matcher);
  if (entry) {
    const position = lockRole(
      matcher,
      entry.normalized,
      prefixRole && (prefixRole === "COACH" || !matcher.byNormalized.get(entry.normalized))
        ? prefixRole
        : entry.position
    );
    return { name: person, position, key: entry.normalized };
  }

  const norm = normalizePlayerKey(person);
  const locked = matcher.lockedRoles.get(norm);
  if (locked) return { name: person, position: locked, key: norm };

  const inferred = matcher.inferredRoles.get(norm);
  if (inferred) {
    const position = lockRole(matcher, norm, prefixRole ?? inferred);
    return { name: person, position, key: norm };
  }
  if (prefixRole && looksLikePersonName(person)) {
    const position = lockRole(matcher, norm, prefixRole);
    return { name: person, position, key: norm };
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
  const resolved = text ? resolveStrongRole(text, matcher) : null;
  if (!resolved) return el;

  if (session.seen.has(resolved.key)) {
    return raw;
  }
  session.seen.add(resolved.key);

  const registry = resolveExactName(text, matcher);
  const isBareSurname =
    !!registry && normalizePlayerKey(text) !== registry.normalized;
  return (
    <PlayerNameChip
      name={isBareSurname ? registry!.displayName : resolved.name}
      position={resolved.position}
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
