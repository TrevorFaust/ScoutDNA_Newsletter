"use client";

import { RumorSectionActions } from "@/components/RumorSectionActions";

type SectionRow = {
  id: string;
  flags: string[];
  talk_markdown: string | null;
  newsletter_teams: { name: string; slug: string };
};

export function RumorReviewPanel({ sections }: { sections: SectionRow[] }) {
  const rumorSections = sections.filter((s) =>
    (s.flags ?? []).includes("review:rumor")
  );

  if (rumorSections.length === 0) {
    return (
      <p style={{ color: "var(--muted)" }}>No rumor flags in this draft.</p>
    );
  }

  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {rumorSections.map((s) => (
        <li
          key={s.id}
          style={{
            border: "1px solid var(--border, #333)",
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "0.75rem",
          }}
        >
          <strong>{s.newsletter_teams.name}</strong>
          <RumorSectionActions
            sectionId={s.id}
            flags={s.flags}
            talkMarkdown={s.talk_markdown}
            editable
          />
        </li>
      ))}
    </ul>
  );
}
