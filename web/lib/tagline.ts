/**
 * Weekly opener check. Keep this regex in sync with
 * pipeline/src/opening.py and the fan site's NewsTeamWeeklies tagline.
 * Scores (34-22) and records (3-2) are not stat lines.
 */
const STAT_LINE =
  /\bPPR\b|\d+\s+carr(?:y|ies)\b|\b(?:caught|catches)\b|\bcompleted\s+\d+|\d+\s+of\s+\d+\s+(?:passes|targets|attempts)\b|\d+\s+yards\b|\btarget share\b|\bsnap share\b/i;

const ABBREV =
  /(?:\b(?:Jr|Sr|St|Dr|Mr|Ms|No|vs|Inc|Jan|Feb|Aug|Sept?|Oct|Nov|Dec)|\s[A-Z])\.$/;

export function openingSentences(text: string): string[] {
  const cleaned = (text || "")
    .replace(/[#>*_`]/g, "")
    .replace(/[\u00b9\u00b2\u00b3\u2070-\u209f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const shielded = cleaned
    .replace(/(\d)\.(\d)/g, "$1\u0000$2")
    .replace(/([A-Z])\.(?=[A-Z])/g, "$1\u0001");
  const parts = shielded.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
  const out: string[] = [];
  for (const part of parts) {
    const piece = part.replace(/\u0000/g, ".").replace(/\u0001/g, ".").trim();
    if (!piece) continue;
    const previous = out[out.length - 1];
    if (previous && ABBREV.test(previous)) out[out.length - 1] = `${previous} ${piece}`;
    else out.push(piece);
  }
  return out;
}

/** True when sentence 1 is a box score rather than the game or the week. */
export function openingIsStatLine(text: string): boolean {
  const first = openingSentences(text)[0];
  return Boolean(first && STAT_LINE.test(first));
}
