/**
 * Infer chip roles for bold names missing from the roster/coach registry.
 * Used so free-agent pickups get position colors and reporters get Other —
 * without dumping unresolved player/coach names into Other.
 *
 * CRITICAL: short codes (te, qb) must use word boundaries. Substring
 * matching turned "the" into TE and "Penix"/"competing" into K.
 *
 * Confidence scoring: phrase cues beat short tokens; the highest-confidence
 * cue for a name wins so a weak nearby token cannot lock the wrong badge
 * before a stronger "WR **Name**" cue is seen.
 */

import {
  normalizePlayerKey,
  type FantasyPosition,
} from "@/lib/positions";

export type InferredRoleMap = Map<string, FantasyPosition>;

type ScoredRole = { role: FantasyPosition; score: number };

/** Multi-word / long phrases — safe for includes() after lowercasing. */
const POS_PHRASES: [string, FantasyPosition][] = [
  ["quarterback", "QB"],
  ["running back", "RB"],
  ["fullback", "RB"],
  ["wide receiver", "WR"],
  ["in the slot", "WR"],
  ["slot role", "WR"],
  ["slot receiver", "WR"],
  ["tight end", "TE"],
  ["offensive lineman", "OL"],
  ["offensive tackle", "OL"],
  ["offensive guard", "OL"],
  ["defensive end", "DEF"],
  ["defensive tackle", "DEF"],
  ["defensive lineman", "DEF"],
  ["defensive back", "DEF"],
  ["pass rusher", "DEF"],
  ["pass-rush", "DEF"],
  ["linebacker", "DEF"],
  ["cornerback", "DEF"],
  ["long snapper", "OL"],
];

/**
 * Short codes / single tokens — MUST match as whole words only.
 * Never include bare letters like "p", "s", or "k".
 */
const POS_TOKENS: [string, FantasyPosition][] = [
  ["qb", "QB"],
  ["rb", "RB"],
  ["fb", "RB"],
  ["wr", "WR"],
  ["receiver", "WR"],
  ["te", "TE"],
  ["kicker", "K"],
  ["pk", "K"],
  ["ol", "OL"],
  ["ot", "OL"],
  ["og", "OL"],
  ["lt", "OL"],
  ["rt", "OL"],
  ["lg", "OL"],
  ["rg", "OL"],
  ["tackle", "OL"],
  ["guard", "OL"],
  ["center", "OL"],
  ["edge", "DEF"],
  ["de", "DEF"],
  ["dt", "DEF"],
  ["dl", "DEF"],
  ["lb", "DEF"],
  ["cb", "DEF"],
  ["corner", "DEF"],
  ["safety", "DEF"],
  ["db", "DEF"],
  ["nickel", "DEF"],
  ["ls", "OL"],
  ["punter", "K"],
];

const POS_PHRASE_ALT = POS_PHRASES.map(([w]) =>
  w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
)
  .sort((a, b) => b.length - a.length)
  .join("|");

const POS_TOKEN_ALT = POS_TOKENS.map(([w]) =>
  w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
)
  .sort((a, b) => b.length - a.length)
  .join("|");

function roleFromWindow(
  window: string
): { role: FantasyPosition; viaPhrase: boolean } | null {
  const raw = window.toLowerCase();
  for (const [phrase, role] of POS_PHRASES) {
    if (raw.includes(phrase)) return { role, viaPhrase: true };
  }
  for (const [token, role] of POS_TOKENS) {
    const re = new RegExp(
      `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    if (re.test(raw)) return { role, viaPhrase: false };
  }
  return null;
}

const COACH_PREFIX_RE =
  /^(?:HC|OC|DC|STC|GM|Head Coach|Offensive Coordinator|Defensive Coordinator|Special Teams Coordinator|General Manager)\.?\s+/i;
const POS_PREFIX_RE =
  /^(?:QB|RB|FB|WR|TE|OL|OG|OT|LT|RT|LG|RG|C|DE|DT|DL|LB|CB|S|FS|SS|SAF|DB|K|PK|P|LS|NT|EDGE)\.?\s+/i;

/**
 * Strip HC/OC/DC/WR prefixes and possessives from a bold span so
 * "**DC Al Golden's**" resolves as Al Golden (coach), not a WR.
 */
export function cleanChipName(raw: string): {
  name: string;
  prefixRole: FantasyPosition | null;
} {
  let s = raw.trim().replace(/['’]s$/i, "");
  let prefixRole: FantasyPosition | null = null;
  for (let n = 0; n < 2; n++) {
    const coach = COACH_PREFIX_RE.exec(s);
    if (coach) {
      prefixRole = "COACH";
      s = s.slice(coach[0].length);
      continue;
    }
    const pos = POS_PREFIX_RE.exec(s);
    if (pos) {
      const hit = roleFromWindow(pos[0]);
      if (hit && !prefixRole) prefixRole = hit.role;
      s = s.slice(pos[0].length);
      continue;
    }
    break;
  }
  return { name: s.trim(), prefixRole };
}

function setScored(
  scores: Map<string, ScoredRole>,
  name: string,
  role: FantasyPosition,
  score: number
) {
  const cleaned = cleanChipName(name).name || name;
  const key = normalizePlayerKey(cleaned);
  if (!key) return;
  if (!looksLikePersonName(cleaned) && role !== "OTHER" && role !== "COACH") return;
  if (role === "OTHER" && key.length < 4) return;

  const existing = scores.get(key);
  if (!existing || score > existing.score) {
    scores.set(key, { role, score });
  }
}

/** Reject "QB battle", "Fantasy lens", single common nouns, etc. */
export function looksLikePersonName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    /^(qb|rb|wr|te|ol|dl|lb|db|k|def|dst|idp)\b/.test(lower) ||
    /\b(battle|competition|committee|depth chart|offense|defense|unit|room|lens|report|recap)\b/i.test(
      trimmed
    )
  ) {
    return false;
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.every(
      (p) =>
        /^[A-ZÀ-ÖØ-Þ]/.test(p) || /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(p)
    );
  }
  return (
    parts.length === 1 && /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’.-]{2,}$/.test(parts[0])
  );
}

function addMatches(
  scores: Map<string, ScoredRole>,
  text: string,
  re: RegExp,
  roleFor: (match: RegExpExecArray) => FantasyPosition | null,
  score: number
) {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const role = roleFor(m);
    const raw = (m[1] || m[2] || "").trim();
    const { name, prefixRole } = cleanChipName(raw);
    if ((role || prefixRole) && name) {
      setScored(scores, name, prefixRole ?? role!, score);
    }
  }
}

/**
 * For each bold name, look at the prior clause for a position word.
 * Low confidence for short tokens so a later "WR **Name**" can win.
 */
function inferFromNearbyContext(scores: Map<string, ScoredRole>, text: string) {
  const boldRe = /\*\*([^*]+)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    const { name, prefixRole } = cleanChipName(m[1].trim());
    const key = normalizePlayerKey(name);
    if (!key || !looksLikePersonName(name)) continue;
    if (prefixRole === "COACH") {
      setScored(scores, name, "COACH", 110);
      continue;
    }

    const start = Math.max(0, m.index - 48);
    const before = text.slice(start, m.index);
    const clause = before.split(/[.!?\n;]/).pop() ?? before;
    const afterRaw = text.slice(m.index + m[0].length, m.index + m[0].length + 64);
    const after = afterRaw.split(/\*\*|[.!?\n;]/)[0] ?? "";
    const hit = roleFromWindow(clause) ?? roleFromWindow(after);
    if (!hit || hit.role === "OTHER") continue;
    setScored(scores, name, hit.role, hit.viaPhrase ? 55 : 25);
  }
}

/**
 * Scan section markdown for bold names tied to clear role language.
 * Registry hits still win in the chipper; this only fills gaps.
 * Highest-confidence cue per name wins.
 */
export function inferRolesFromContext(contextText: string): InferredRoleMap {
  const scores = new Map<string, ScoredRole>();
  if (!contextText) return new Map();

  const boldNames = /\*\*([^*]+)\*\*/g;
  let bold: RegExpExecArray | null;
  while ((bold = boldNames.exec(contextText)) !== null) {
    const { name, prefixRole } = cleanChipName(bold[1]);
    if (prefixRole && looksLikePersonName(name)) {
      setScored(scores, name, prefixRole, 110);
    }
  }

  addMatches(
    scores,
    contextText,
    /\b(?:ESPN|NFL Network|The Athletic|CBS Sports|NBC Sports|Fox Sports|Yahoo(?: Sports)?|Bleacher Report|Pro Football Talk|PFT|Locked On[\w\s]*)(?:'s)?\s+\*\*([^*]+)\*\*/gi,
    () => "OTHER",
    95
  );
  addMatches(
    scores,
    contextText,
    /\b(?:columnist|beat writer|beat reporter|reporter|analyst|insider|podcast host)\s+\*\*([^*]+)\*\*/gi,
    () => "OTHER",
    95
  );
  addMatches(
    scores,
    contextText,
    /\*\*([^*]+)\*\*\s+reported\b/gi,
    () => "OTHER",
    90
  );

  addMatches(
    scores,
    contextText,
    /\b(?:head coach|offensive coordinator|defensive coordinator|special teams coordinator|passing game coordinator|run game coordinator|assistant head coach|assistant coach|quarterbacks coach|wide receivers coach|running backs coach|tight ends coach|offensive line coach|defensive line coach|linebackers coach|secondary coach|safeties coach|cornerbacks coach|general manager|GM|owner|president|executive vice president|EVP)\s+\*\*([^*]+)\*\*/gi,
    () => "COACH",
    100
  );
  addMatches(
    scores,
    contextText,
    /\*\*([^*]+)\*\*,?\s+(?:the\s+)?(?:head coach|offensive coordinator|defensive coordinator|special teams coordinator|general manager|GM)\b/gi,
    () => "COACH",
    100
  );
  addMatches(
    scores,
    contextText,
    /\b(?:HC|OC|DC|STC|GM)\s+\*\*([^*]+)\*\*/g,
    () => "COACH",
    95
  );

  const posBefore = new RegExp(
    `\\b(?:free agent\\s+)?(?:${POS_PHRASE_ALT}|${POS_TOKEN_ALT})\\s+\\*\\*([^*]+)\\*\\*`,
    "gi"
  );
  addMatches(scores, contextText, posBefore, (m) => {
    const hit = roleFromWindow(m[0]);
    return hit?.role ?? null;
  }, 100);

  const posParen = new RegExp(
    `\\*\\*([^*]+)\\*\\*\\s*\\((${POS_PHRASE_ALT}|${POS_TOKEN_ALT})\\)`,
    "gi"
  );
  addMatches(scores, contextText, posParen, (m) => {
    const hit = roleFromWindow(m[2] || "");
    return hit?.role ?? null;
  }, 90);

  const claimed =
    /\bclaimed\s+\*\*([^*]+)\*\*\s+off waivers|\bclaimed\s+(?:tight end|wide receiver|running back|quarterback|edge|linebacker|safety|corner(?:back)?|defensive (?:end|tackle|lineman)|offensive (?:tackle|guard|lineman)|pass rusher)\s+\*\*([^*]+)\*\*/gi;
  addMatches(scores, contextText, claimed, (m) => {
    const name = (m[1] || m[2] || "").trim();
    if (!name) return null;
    const window = contextText.slice(
      Math.max(0, m.index - 40),
      m.index + m[0].length + 20
    );
    return roleFromWindow(window)?.role ?? null;
  }, 85);

  inferFromNearbyContext(scores, contextText);

  addMatches(
    scores,
    contextText,
    /\b(?:signed|signing of|acquired|added|activated|claimed)\s+(?:free agent\s+)?(?:[\w.-]+\s+)?\*\*([^*]+)\*\*/gi,
    (m) => {
      const window = contextText.slice(
        Math.max(0, m.index - 48),
        m.index + m[0].length + 48
      );
      return roleFromWindow(window)?.role ?? null;
    },
    70
  );

  const map: InferredRoleMap = new Map();
  for (const [key, { role }] of scores) {
    map.set(key, role);
  }
  return map;
}
