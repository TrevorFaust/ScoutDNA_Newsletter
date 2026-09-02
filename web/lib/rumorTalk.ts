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
