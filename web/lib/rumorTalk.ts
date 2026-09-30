/** True when a section still needs Confirm/Reject in the Rumors queue. */
export function hasPendingRumorFlag(flags: string[] | null | undefined): boolean {
  return (flags ?? []).includes("review:rumor");
}

/** Detect a marked rumor callout line (used when stripping on reject). */
function isRumorCalloutLine(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    line.includes("🚩") ||
    /rumor-adjacent/i.test(line) ||
    (/^>\s*/.test(line) && /rumor/i.test(lower))
  );
}

/** Prefer Activity (where rumors now live); fall back to legacy Talk. */
export function rumorSourceMarkdown(
  activity: string | null | undefined,
  talk: string | null | undefined
): string {
  if (activity?.trim()) return activity;
  return talk?.trim() ? talk : "";
}

/** Pull rumor callouts from Activity/Talk for the review UI. */
export function extractRumorFromTalk(markdown: string | null): string {
  if (!markdown?.trim()) return "";

  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inRumorBlock = false;

  for (const line of lines) {
    const looksLikeRumor =
      isRumorCalloutLine(line) || /\brumor\b/i.test(line);

    if (looksLikeRumor) {
      if (!inRumorBlock && current.length) {
        blocks.push(current.join("\n").trim());
        current = [];
      }
      inRumorBlock = true;
      current.push(line.replace(/^>\s*/, "").trim());
      continue;
    }
    if (inRumorBlock && /^>\s*/.test(line)) {
      current.push(line.replace(/^>\s*/, "").trim());
      continue;
    }
    if (inRumorBlock) {
      if (current.length) blocks.push(current.join("\n").trim());
      current = [];
      inRumorBlock = false;
    }
  }
  if (current.length) blocks.push(current.join("\n").trim());

  const extracted = blocks.filter(Boolean).join("\n\n").trim();
  if (extracted) return extracted;

  // No marked callout — show body so reviewers still see the rumor prose.
  return lines
    .filter(
      (l) =>
        !/^#{1,6}\s*(Talk|Activity)\s*$/i.test(l.trim())
    )
    .join("\n")
    .trim();
}

/**
 * Remove draft/review meta after a decision so the edition no longer
 * reads like it is waiting for approval.
 */
export function stripReviewMetaFromTalk(markdown: string | null): string {
  if (!markdown?.trim()) return markdown ?? "";

  const cleaned = markdown
    .split("\n")
    .map((line) => {
      let next = line;
      next = next.replace(/\*\*review:rumor\*\*/gi, "");
      next = next.replace(/\breview:rumor\b/gi, "");
      next = next.replace(
        /\s*[—–-]?\s*(?:and\s+)?(?:the\s+)?story carries a\s+flag[^.]*\./gi,
        ""
      );
      next = next.replace(
        /\s*[—–-]?\s*(?:given|with)\s+its\s+[^.]*flag[^.]*\./gi,
        ""
      );
      next = next.replace(/\s*\(\s*needs[- ]review\s*\)/gi, "");
      next = next.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1");
      return next.trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (/^#{1,6}\s*(Talk|Activity)\s*$/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}

/** Strip rumor callouts from Activity/Talk markdown after reject-remove. */
export function stripRumorFromTalk(markdown: string | null): string {
  if (!markdown?.trim()) return markdown ?? "";

  const lines = markdown.split("\n");
  const out: string[] = [];
  let inRumorBlock = false;

  for (const line of lines) {
    if (isRumorCalloutLine(line)) {
      inRumorBlock = true;
      continue;
    }
    if (inRumorBlock && /^>\s*/.test(line)) {
      continue;
    }
    if (inRumorBlock && line.trim() === "") {
      inRumorBlock = false;
      continue;
    }
    inRumorBlock = false;
    out.push(line);
  }

  let cleaned = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (/^#{1,6}\s*(Talk|Activity)\s*$/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}

export type RumorFootnote = {
  n: number;
  label: string;
  url?: string;
};

/**
 * Weekly recaps keep Activity empty and park trade buzz in a reference line.
 * Match those labels, plus an explicit rumor word in prose.
 */
const RUMOR_SOURCE =
  /\brumou?rs?\b|\breview:rumor\b|\btrade\s+(?:buzz|rumou?rs?|suitor|idea|chatter|talk|help)\b|\btop\s+trade\s+suitor\b|\blinked\b[^.]{0,80}\btrade\b|\bcalls?\s+for\s+trade\b/i;

export function isRumorSourceLabel(label: string): boolean {
  return RUMOR_SOURCE.test(label);
}

const QUIET_STUB = /^_No verified updates\b/i;

function isQuietStub(markdown: string): boolean {
  const body = markdown
    .replace(/^#{1,6}\s*(Talk|Activity|Fantasy lens)\s*$/gim, "")
    .trim();
  return !body || QUIET_STUB.test(body);
}

/** Activity when it has real copy; otherwise leftover Talk. Skip quiet stubs. */
export function usableRumorMarkdown(
  activity: string | null | undefined,
  talk: string | null | undefined
): string {
  const act = activity?.trim() ?? "";
  if (act && !isQuietStub(act)) return act;
  const talkBody = talk?.trim() ?? "";
  if (talkBody && !isQuietStub(talkBody)) return talkBody;
  return "";
}

function rumorSentences(markdown: string | null | undefined): string[] {
  if (!markdown?.trim()) return [];
  return markdown
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length > 0 &&
        !/^#{1,6}\s/.test(part) &&
        isRumorSourceLabel(part)
    );
}

export function cleanRumorLabel(label: string): string {
  const withoutToken = label
    .replace(/\s*\(\s*review:rumor\s*\)/gi, "")
    .replace(/\*\*review:rumor\*\*/gi, "")
    .replace(/\breview:rumor\b/gi, "");
  return stripReviewMetaFromTalk(withoutToken)
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const SUPER_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function toSuperscript(n: number): string {
  return String(n).replace(/\d/g, (digit) => SUPER_DIGITS[Number(digit)] ?? digit);
}

export function citedFootnoteNumbers(text: string): Set<number> {
  const found = new Set<number>();
  for (let n = 12; n >= 1; n -= 1) {
    if (text.includes(toSuperscript(n))) found.add(n);
  }
  return found;
}

/** Drop a trailing rumor clause from a reference that the body still cites. */
export function stripRumorClause(label: string): string {
  let next = label
    .replace(/\s*\+\s*[^,+]*\brumou?rs?\b[^,]*/gi, "")
    .replace(/\s*[,;]\s*[^,;]*\brumou?rs?\b[^,;]*/gi, "")
    .replace(/\s*\(\s*review:rumor\s*\)/gi, "");
  next = cleanRumorLabel(next);
  return next.replace(/^[,;:\s]+|[,;:\s]+$/g, "").trim();
}

export function rumorFootnoteLines(footnotes: RumorFootnote[] | null | undefined): string[] {
  return (footnotes ?? [])
    .filter((fn) => fn?.label && isRumorSourceLabel(fn.label))
    .map((fn) => `${fn.n}. ${cleanRumorLabel(fn.label)}`);
}

/**
 * Text the Rumors queue should show.
 * Daily/camp: Activity (or legacy Talk).
 * Weekly: rumor sentences plus reference lines, because Activity is empty.
 */
export function collectRumorExcerpt(input: {
  activity?: string | null;
  talk?: string | null;
  intro?: string | null;
  fantasy?: string | null;
  footnotes?: RumorFootnote[] | null;
}): string {
  const parts: string[] = [];
  const body = usableRumorMarkdown(input.activity, input.talk);
  if (body) {
    const extracted = extractRumorFromTalk(body);
    if (extracted) parts.push(extracted);
  } else {
    const sentences = [
      ...rumorSentences(input.intro),
      ...rumorSentences(input.fantasy),
    ];
    if (sentences.length) parts.push(sentences.join("\n"));
  }

  const notes = rumorFootnoteLines(input.footnotes).filter((line) => {
    const label = line.replace(/^\d+\.\s*/, "");
    return !parts.some((part) => part.includes(label.slice(0, 48)));
  });
  if (notes.length) parts.push(notes.join("\n"));
  return parts.join("\n\n").trim();
}

/** Remove rumor references. Keep a cited note after cutting the rumor clause. */
export function dropRumorFootnotes(
  footnotes: RumorFootnote[] | null | undefined,
  citedIn: string
): RumorFootnote[] {
  const cited = citedFootnoteNumbers(citedIn);
  return (footnotes ?? []).flatMap((fn) => {
    if (!fn?.label || !isRumorSourceLabel(fn.label)) return [fn];
    if (!cited.has(fn.n)) return [];
    const label = stripRumorClause(fn.label);
    if (!label || label.length < 8 || isRumorSourceLabel(label)) return [fn];
    return [{ ...fn, label }];
  });
}

/**
 * Apply an edited "n. label" list. Omitted rumor notes are dropped when the
 * body does not cite them.
 */
export function applyRumorFootnoteEdits(
  footnotes: RumorFootnote[] | null | undefined,
  edited: string,
  citedIn: string
): RumorFootnote[] {
  const editedByN = new Map<number, string>();
  for (const line of edited.split("\n")) {
    const match = line.trim().match(/^(\d+)\.\s+(.+)$/);
    if (!match) continue;
    editedByN.set(Number(match[1]), cleanRumorLabel(match[2]));
  }
  const cited = citedFootnoteNumbers(citedIn);
  return (footnotes ?? []).flatMap((fn) => {
    if (!fn?.label || !isRumorSourceLabel(fn.label)) return [fn];
    const next = editedByN.get(fn.n);
    if (!next) {
      if (cited.has(fn.n)) {
        const label = stripRumorClause(fn.label);
        return label ? [{ ...fn, label }] : [fn];
      }
      return [];
    }
    return [{ ...fn, label: next }];
  });
}
