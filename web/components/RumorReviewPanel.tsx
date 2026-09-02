"use client";

import { useState } from "react";
import { RumorSectionActions } from "@/components/RumorSectionActions";

type SectionRow = {
  id: string;
  flags: string[];
  activity_markdown?: string | null;
  talk_markdown: string | null;
  newsletter_teams: { name: string; slug: string };
};

export function RumorReviewPanel({ sections }: { sections: SectionRow[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const rumorSections = sections.filter(
    (s) => (s.flags ?? []).includes("review:rumor") && !dismissed.has(s.id)
  );

  if (rumorSections.length === 0) {
    return (
      <p className="camp-admin-muted" style={{ marginTop: "1rem" }}>
        No rumor flags left in this draft.
      </p>
    );
  }

  return (
    <ul className="rumor-team-queue">
      {rumorSections.map((s, index) => (
        <li key={s.id} className="rumor-team-item">
          <div className="rumor-team-head">
            <span className="rumor-team-index">
              {index + 1} / {rumorSections.length}
            </span>
            <strong className="rumor-team-name">{s.newsletter_teams.name}</strong>
          </div>
          <RumorSectionActions
            sectionId={s.id}
            flags={s.flags}
            talkMarkdown={s.activity_markdown?.trim() ? s.activity_markdown : s.talk_markdown}
            editable
            onResolved={() =>
              setDismissed((prev) => {
                const next = new Set(prev);
                next.add(s.id);
                return next;
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}
