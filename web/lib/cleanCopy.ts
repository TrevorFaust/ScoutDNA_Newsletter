/**
 * Strip em/en dashes from newsletter prose.
 * Ranges (4–6) become hyphens; asides become commas.
 *
 * Build a fresh regex per call. A module-level /g lastIndex would skip
 * matches on later sections and mismatch SSR vs client hydration.
 *
 * Also: CommonMark will not treat closing `**` as right-flanking when it is
 * preceded by punctuation (`Jr.`) and followed by a superscript footnote
 * (Unicode category No). That leaks literal `**Name Jr.**¹` asterisks.
 * Insert a space between `**` and ¹²… so bold still parses.
 *
 * Compose sometimes leaks internal snake_case flag names into prose.
 * Translate those to plain English so they never reach readers.
 */
const INTERNAL_FLAG_REPLACEMENTS: [RegExp, string][] = [
  [/\brb_rush_share\b/gi, "RB rush share"],
  [/\brush_share\b/gi, "rush share"],
  [/\btarget_share\b/gi, "target share"],
  [/\bair_yards_share\b/gi, "air yards share"],
  [/\btouch_share\b/gi, "touch share"],
  [/\bsnap_pct\b/gi, "snap share"],
  [/\bwr_target_split\b/gi, "receiver target split"],
  [/\bsplit_backfield\b/gi, "split backfield"],
  [/\bte_featured\b/gi, "featured tight end usage"],
  [/\bfantasy_skill_depth\b/gi, "fantasy depth chart"],
  [/\bskill_position_battles\b/gi, "position battles"],
  [/\btarget_leader\b/gi, "target leader"],
];

/** Detect leftover snake_case tokens that should never ship to readers. */
export function findInternalFlagLeaks(text: string): string[] {
  if (!text) return [];
  const hits = new Set<string>();
  for (const m of text.matchAll(/\b[a-z]+(?:_[a-z0-9]+)+\b/g)) {
    hits.add(m[0]);
  }
  return [...hits];
}

/** Drop leaked markdown pipe tables; usage UI renders real tables instead. */
export function stripMarkdownTables(text: string): string {
  if (!text || !text.includes("|")) return text;
  const lines = text.split("\n");
  const kept: string[] = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isTableRow =
      trimmed.startsWith("|") && trimmed.includes("|", 1);
    const isSep =
      /^\|?\s*:?-{3,}.*\|/.test(trimmed) ||
      /^\|?(?:\s*:?-{3,}\s*\|)+\s*:?-{3,}\s*\|?\s*$/.test(trimmed);
    if (isTableRow || isSep) {
      inTable = true;
      continue;
    }
    if (inTable && trimmed === "") {
      inTable = false;
      continue;
    }
    inTable = false;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function cleanCopy(text: string): string {
  if (!text) return text;
  let out = stripMarkdownTables(text)
    .replace(new RegExp("\\s+[\\u2014\\u2013]\\s+", "g"), ", ")
    .replace(new RegExp("[\\u2014\\u2013]", "g"), "-")
    .replace(
      new RegExp("(\\*\\*[^*]+?\\*\\*)\\s*\\((?:QB|RB|WR|TE)(?:\\d)?\\)", "gi"),
      "$1"
    )
    .replace(/(\*\*)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, "$1 $2");
  for (const [pat, repl] of INTERNAL_FLAG_REPLACEMENTS) {
    out = out.replace(pat, repl);
  }
  return out.replace(/,\s*,+/g, ",");
}
