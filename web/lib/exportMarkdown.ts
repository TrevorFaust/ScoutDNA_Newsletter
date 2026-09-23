import { normalizeInlineCitations } from "@/lib/citations";
import { cleanCopy } from "@/lib/cleanCopy";
import { usableField } from "@/lib/sections";
import { getDivisionGroups } from "@/lib/teams";

export type Footnote = { n: number; label: string; url: string };

export type ExportSection = {
  intro_paragraphs: string | null;
  rookie_paragraph: string | null;
  activity_markdown: string | null;
  talk_markdown: string | null;
  fantasy_markdown: string | null;
  footnotes: Footnote[] | null;
  is_empty?: boolean | null;
  teams: { slug: string; name: string; abbrev?: string; reddit_subreddit?: string | null };
};

const SUBSTACK_URL =
  process.env.SUBSTACK_PUBLICATION_URL?.replace(/\/$/, "") ??
  "https://trevorfaust.substack.com";

/** Strip leading markdown heading markers for plain Reddit headings. */
function stripHeadingMarkers(text: string): string {
  return text.replace(/^#{1,6}\s+/gm, "").trim();
}

function normalizeBody(
  text: string,
  opts?: { keepHeadings?: boolean }
): string {
  let out = cleanCopy(normalizeInlineCitations(text)).trim();
  if (!opts?.keepHeadings) out = stripHeadingMarkers(out);
  return out.trim();
}

function formatReferences(footnotes: Footnote[]): string {
  const list = [...footnotes]
    .filter((f) => f.label?.trim() || f.url?.trim())
    .sort((a, b) => a.n - b.n);
  if (!list.length) return "";

  const lines = list.map((fn) => {
    const label = (fn.label || fn.url || `Source ${fn.n}`).trim();
    if (fn.url?.trim()) {
      return `${fn.n}. [${label}](${fn.url.trim()})`;
    }
    return `${fn.n}. ${label}`;
  });

  return [`### References (${list.length})`, ...lines].join("\n");
}

function hasExportableContent(section: ExportSection): boolean {
  return (
    usableField(section.intro_paragraphs) ||
    usableField(section.fantasy_markdown)
  );
}

/** Team section for Reddit drafts (plain text, no site badges/tags). */
export function exportTeamMarkdown(
  section: ExportSection,
  opts?: { includeSubstackFooter?: boolean }
): string | null {
  if (section.is_empty && !hasExportableContent(section)) return null;
  if (!hasExportableContent(section)) return null;

  const parts: string[] = [`**${section.teams.name}**`];

  if (usableField(section.intro_paragraphs)) {
    parts.push(normalizeBody(section.intro_paragraphs!));
  }

  if (usableField(section.fantasy_markdown)) {
    parts.push(normalizeBody(section.fantasy_markdown!));
  }

  const refs = formatReferences(section.footnotes ?? []).replace(
    /^###\s+/m,
    ""
  );
  if (refs) parts.push(refs);

  if (opts?.includeSubstackFooter !== false) {
    parts.push(`---\nMore team notes: ${SUBSTACK_URL}`);
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

/**
 * One team block shaped like the weekly issue page:
 * bold team H2, intro, Fantasy lens, references.
 */
export function exportTeamEditionMarkdown(section: ExportSection): string | null {
  if (section.is_empty && !hasExportableContent(section)) return null;
  if (!hasExportableContent(section)) return null;

  const parts: string[] = [`## ${section.teams.name}`];

  if (usableField(section.intro_paragraphs)) {
    parts.push(normalizeBody(section.intro_paragraphs!, { keepHeadings: true }));
  }

  if (usableField(section.fantasy_markdown)) {
    parts.push(
      normalizeBody(section.fantasy_markdown!, { keepHeadings: true })
    );
  }

  const refs = formatReferences(section.footnotes ?? []);
  if (refs) parts.push(refs);

  return parts.filter(Boolean).join("\n\n").trim();
}

export function redditDraftTitle(teamName: string, issueDateLabel: string): string {
  return `${teamName} — ${issueDateLabel}`;
}

/**
 * Full issue markdown laid out like `/issue/{date}`:
 * League-wide, then divisions and team headers in site order.
 */
export function exportIssueMarkdown(input: {
  title: string;
  leagueSection: string | null;
  leagueFootnotes?: Footnote[] | null;
  sections: ExportSection[];
  /** When false, skip the title line (Substack already has draft_title). */
  includeTitle?: boolean;
}): string {
  const bySlug = Object.fromEntries(
    input.sections.map((s) => [s.teams.slug, s])
  );
  const parts: string[] = [];

  if (input.includeTitle !== false) {
    parts.push(`## ${input.title.trim()}`);
  }

  if (usableField(input.leagueSection)) {
    parts.push("## League-wide");
    parts.push(
      normalizeBody(input.leagueSection!, { keepHeadings: true })
    );
    const leagueRefs = formatReferences(input.leagueFootnotes ?? []);
    if (leagueRefs) parts.push(leagueRefs);
  }

  const divisions = getDivisionGroups();
  for (const [divName, teams] of Object.entries(divisions)) {
    const teamBlocks: string[] = [];
    for (const team of teams) {
      const section = bySlug[team.slug];
      if (!section) continue;
      const teamMd = exportTeamEditionMarkdown(section);
      if (teamMd) teamBlocks.push(teamMd);
    }
    if (!teamBlocks.length) continue;
    parts.push("---");
    parts.push(`### ${divName}`);
    parts.push(...teamBlocks);
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

type PmMark = { type: string; attrs?: Record<string, string> };
type PmText = { type: "text"; text: string; marks?: PmMark[] };
type PmInline = PmText;
type PmBlock =
  | { type: "paragraph"; content?: PmInline[] }
  | { type: "heading"; attrs: { level: number }; content?: PmInline[] }
  | { type: "horizontal_rule" }
  | {
      type: "ordered_list" | "bullet_list";
      content: Array<{
        type: "list_item";
        content: Array<{ type: "paragraph"; content?: PmInline[] }>;
      }>;
    };

function addMarks(nodes: PmInline[], extra: PmMark[]): PmInline[] {
  return nodes.map((n) => {
    if (n.type !== "text") return n;
    const marks = [...(n.marks ?? []), ...extra];
    return marks.length ? { ...n, marks } : n;
  });
}

/** Parse inline markdown into ProseMirror text nodes (bold, italic, links). */
function parseInline(text: string): PmInline[] {
  const nodes: PmInline[] = [];
  const patterns: Array<{
    re: RegExp;
    handle: (m: RegExpExecArray) => PmInline[];
  }> = [
    {
      re: /\[([^\]]+)\]\((https?:[^)\s]+)\)/,
      handle: (m) =>
        addMarks(parseInline(m[1]), [{ type: "link", attrs: { href: m[2] } }]),
    },
    {
      re: /\*\*([^*]+)\*\*/,
      handle: (m) => addMarks(parseInline(m[1]), [{ type: "strong" }]),
    },
    {
      re: /\*([^*]+)\*/,
      handle: (m) => addMarks(parseInline(m[1]), [{ type: "em" }]),
    },
  ];

  let remaining = text;
  while (remaining.length) {
    let best: { index: number; len: number; nodes: PmInline[] } | null = null;
    for (const { re, handle } of patterns) {
      const m = re.exec(remaining);
      if (!m || m.index == null) continue;
      if (!best || m.index < best.index) {
        best = { index: m.index, len: m[0].length, nodes: handle(m) };
      }
    }
    if (!best) {
      nodes.push({ type: "text", text: remaining });
      break;
    }
    if (best.index > 0) {
      nodes.push({ type: "text", text: remaining.slice(0, best.index) });
    }
    nodes.push(...best.nodes);
    remaining = remaining.slice(best.index + best.len);
  }

  return nodes.filter((n) => n.type !== "text" || n.text.length > 0);
}

function paragraph(text: string): PmBlock {
  const content = parseInline(text.replace(/\n/g, " ").trim());
  return content.length
    ? { type: "paragraph", content }
    : { type: "paragraph" };
}

/** Team / league titles only — Substack h2/h3 are large display fonts. */
function titleHeading(text: string, level: number): PmBlock {
  const t = text.trim();
  // Never promote essay-length text to a heading (guards false positives).
  if (t.length > 80) return paragraph(t);
  const content = parseInline(t);
  return {
    type: "heading",
    attrs: { level: Math.min(Math.max(level, 1), 2) },
    content: content.length ? content : [{ type: "text", text: t || " " }],
  };
}

/** Activity / Fantasy / Rookies / division labels — bold line, normal size. */
function sectionLabel(text: string): PmBlock {
  const t = text.trim().replace(/^#{1,6}\s+/, "");
  return {
    type: "paragraph",
    content: [{ type: "text", text: t, marks: [{ type: "strong" }] }],
  };
}

function listItem(text: string) {
  return {
    type: "list_item" as const,
    content: [
      {
        type: "paragraph" as const,
        content: parseInline(text),
      },
    ],
  };
}

const TITLE_HEADINGS = /^(league-wide)\b/i;

function pushAtxHeading(content: PmBlock[], rawLine: string) {
  const raw = rawLine.trim();
  const hashes = raw.match(/^#{1,6}/)?.[0].length ?? 2;
  const text = raw.replace(/^#{1,6}\s+/, "").trim();

  // ## Team / ## League-wide → real heading. ### labels → bold paragraph.
  if (hashes <= 2 || TITLE_HEADINGS.test(text)) {
    content.push(titleHeading(text, Math.min(hashes, 2)));
    return;
  }
  content.push(sectionLabel(text));
}

function pushMarkdownBlock(content: PmBlock[], block: string) {
  if (block === "---") {
    content.push({ type: "horizontal_rule" });
    return;
  }

  const lines = block.split("\n").map((l) => l.trimEnd());
  const nonEmpty = lines.filter((l) => l.trim());

  // ATX headings (## Team, ### Activity, etc.)
  if (nonEmpty.length === 1 && /^#{1,6}\s+\S/.test(nonEmpty[0].trim())) {
    pushAtxHeading(content, nonEmpty[0]);
    return;
  }

  // "### References (N)\n1. ...\n2. ..."
  if (
    nonEmpty.length >= 2 &&
    /^#{0,6}\s*references\b/i.test(nonEmpty[0].trim()) &&
    nonEmpty.slice(1).every((l) => /^\d+\.\s+/.test(l.trim()))
  ) {
    content.push(sectionLabel(nonEmpty[0].trim().replace(/^#{1,6}\s+/, "")));
    content.push({
      type: "ordered_list",
      content: nonEmpty.slice(1).map((l) =>
        listItem(l.trim().replace(/^\d+\.\s+/, ""))
      ),
    });
    return;
  }

  const isOrdered = nonEmpty.every((l) => /^\d+\.\s+/.test(l.trim()));
  const isBullet = nonEmpty.every((l) => /^[-*]\s+/.test(l.trim()));

  if (isOrdered || isBullet) {
    content.push({
      type: isOrdered ? "ordered_list" : "bullet_list",
      content: nonEmpty.map((l) =>
        listItem(l.trim().replace(/^\d+\.\s+/, "").replace(/^[-*]\s+/, ""))
      ),
    });
    return;
  }

  // Mixed block: heading line then bullets/prose (### Activity\n- …)
  if (nonEmpty.length > 1 && /^#{1,6}\s+\S/.test(nonEmpty[0].trim())) {
    pushAtxHeading(content, nonEmpty[0]);
    const rest = nonEmpty.slice(1);
    const restIsBullet = rest.every((l) => /^[-*]\s+/.test(l.trim()));
    const restIsOrdered = rest.every((l) => /^\d+\.\s+/.test(l.trim()));
    if (restIsBullet || restIsOrdered) {
      content.push({
        type: restIsOrdered ? "ordered_list" : "bullet_list",
        content: rest.map((l) =>
          listItem(l.trim().replace(/^\d+\.\s+/, "").replace(/^[-*]\s+/, ""))
        ),
      });
      return;
    }
    content.push(paragraph(rest.join("\n")));
    return;
  }

  // Plain prose — never a heading, even if it starts with "Rookie …"
  content.push(paragraph(block));
}

/**
 * Convert export markdown into a Substack draft_body (stringified ProseMirror doc).
 * Raw HTML is rejected/mangled by the Substack editor — this is required.
 */
export function markdownToSubstackBody(md: string): string {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const content: PmBlock[] = [];

  for (const block of blocks) {
    pushMarkdownBlock(content, block);
  }

  if (!content.length) {
    content.push({ type: "paragraph" });
  }

  return JSON.stringify({ type: "doc", content });
}

/** @deprecated Use markdownToSubstackBody — HTML draft_body shows tags in the editor. */
export function markdownToSubstackHtml(md: string): string {
  return markdownToSubstackBody(md);
}
