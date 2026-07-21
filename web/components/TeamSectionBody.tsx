"use client";

import { MarkdownBlock } from "@/components/MarkdownBlock";
import { ReferencesDropdown } from "@/components/ReferencesDropdown";
import { usableField, type TeamSectionContent } from "@/lib/sections";

type Props = {
  section: TeamSectionContent;
  playerEntries?: import("@/lib/playerRegistry").PlayerLookupEntry[];
};

export function TeamSectionBody({ section, playerEntries = [] }: Props) {
  const intro = usableField(section.intro_paragraphs) ? section.intro_paragraphs : null;
  const rookie = usableField(section.rookie_paragraph) ? section.rookie_paragraph : null;
  const activity = usableField(section.activity_markdown) ? section.activity_markdown : null;
  const talk = usableField(section.talk_markdown) ? section.talk_markdown : null;
  const fantasy = usableField(section.fantasy_markdown) ? section.fantasy_markdown : null;

  const sectionContext = [intro, rookie, activity, talk, fantasy].filter(Boolean).join("\n\n");
  const footnotes = (section.footnotes ?? []).filter((f) => f.label?.trim() || f.url?.trim());

  return (
    <div className="prose-team team-section-body">
      {section.tags?.length > 0 && (
        <div className="team-section-tags">
          {section.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      {intro && (
        <MarkdownBlock
          content={intro}
          playerEntries={playerEntries}
          contextText={sectionContext}
        />
      )}
      {rookie && (
        <>
          <h3>Rookies & camp additions</h3>
          <MarkdownBlock
            content={rookie}
            playerEntries={playerEntries}
            contextText={sectionContext}
          />
        </>
      )}
      {activity && (
        <MarkdownBlock
          content={activity}
          playerEntries={playerEntries}
          contextText={sectionContext}
        />
      )}
      {talk && (
        <MarkdownBlock
          content={talk}
          playerEntries={playerEntries}
          contextText={sectionContext}
        />
      )}
      {fantasy && (
        <MarkdownBlock
          content={fantasy}
          playerEntries={playerEntries}
          contextText={sectionContext}
        />
      )}
      {footnotes.length > 0 && <ReferencesDropdown footnotes={footnotes} />}
    </div>
  );
}
