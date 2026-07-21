export type TeamSectionContent = {
  intro_paragraphs: string | null;
  rookie_paragraph: string | null;
  activity_markdown: string | null;
  talk_markdown: string | null;
  fantasy_markdown: string | null;
  footnotes: { n: number; label: string; url: string }[];
  tags: string[];
  flags: string[];
  is_empty: boolean;
  empty_reason: string | null;
};

const PLACEHOLDER_PREFIXES = [
  "_No verified",
  "No verified updates",
  "_Section not composed",
  "No rookie-specific updates",
  "No items collected",
  "Compose response was not valid JSON",
  "No daily or raw input",
  "Skipped",
] as const;

/** Placeholder / quiet-day copy from compose — not real reporting. */
export function isPlaceholderText(text: string | null | undefined): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  const plain = t.replace(/[*_]/g, "").trim();
  if (plain.length < 20) {
    return PLACEHOLDER_PREFIXES.some((p) => plain.startsWith(p) || plain.includes(p));
  }
  return PLACEHOLDER_PREFIXES.some((p) => t.startsWith(p) || plain.startsWith(p));
}

export function usableField(text: string | null | undefined): boolean {
  return Boolean(text?.trim()) && !isPlaceholderText(text);
}

/** True when the section has reported copy worth showing on a team archive. */
export function sectionHasContent(section: TeamSectionContent): boolean {
  return (
    usableField(section.intro_paragraphs) ||
    usableField(section.rookie_paragraph) ||
    usableField(section.activity_markdown) ||
    usableField(section.talk_markdown) ||
    usableField(section.fantasy_markdown)
  );
}
