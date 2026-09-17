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
 */
export function cleanCopy(text: string): string {
  if (!text) return text;
  return text
    .replace(new RegExp("\\s+[\\u2014\\u2013]\\s+", "g"), ", ")
    .replace(new RegExp("[\\u2014\\u2013]", "g"), "-")
    .replace(
      new RegExp("(\\*\\*[^*]+?\\*\\*)\\s*\\((?:QB|RB|WR|TE)(?:\\d)?\\)", "gi"),
      "$1"
    )
    .replace(/(\*\*)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, "$1 $2")
    .replace(/,\s*,+/g, ",");
}
