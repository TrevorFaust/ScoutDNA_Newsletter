/** Strip rumor callouts from Talk markdown after reject-remove. */

export function stripRumorFromTalk(talk: string | null): string {
  if (!talk?.trim()) return talk ?? "";

  const lines = talk.split("\n");
  const out: string[] = [];
  let inRumorBlock = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isRumorLine =
      line.includes("🚩") ||
      /rumor-adjacent/i.test(line) ||
      (/^>\s*/.test(line) && /rumor/i.test(lower));

    if (isRumorLine) {
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
