/** Detect a marked rumor callout line (used when stripping on reject). */
function isRumorCalloutLine(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    line.includes("🚩") ||
    /rumor-adjacent/i.test(line) ||
    (/^>\s*/.test(line) && /rumor/i.test(lower))
  );
}

/** Pull rumor callouts from Talk for the review UI. Falls back to full Talk body. */
export function extractRumorFromTalk(talk: string | null): string {
  if (!talk?.trim()) return "";

  const lines = talk.split("\n");
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

  // No marked callout — show Talk body so reviewers still see the rumor prose.
  return lines
    .filter((l) => !/^#{1,6}\s*Talk\s*$/i.test(l.trim()))
    .join("\n")
    .trim();
}

/** Strip rumor callouts from Talk markdown after reject-remove. */
export function stripRumorFromTalk(talk: string | null): string {
  if (!talk?.trim()) return talk ?? "";

  const lines = talk.split("\n");
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
  if (cleaned === "### Talk" || cleaned === "### Talk\n") {
    return "";
  }
  return cleaned;
}
