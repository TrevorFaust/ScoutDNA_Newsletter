"use client";

import { useMemo } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { ReferencesDropdown } from "@/components/ReferencesDropdown";
import { cleanCopy } from "@/lib/cleanCopy";
import { usableField, type TeamSectionContent } from "@/lib/sections";
import { buildChipMatcher } from "@/lib/wrapPlayerNames";
import { deserializePlayerLookup } from "@/lib/playerRegistry";

type Props = {
  section: TeamSectionContent;
  playerEntries?: import("@/lib/playerRegistry").PlayerLookupEntry[];
  teamAbbr?: string | null;
};

function cleanField(value: string | null | undefined): string | null {
  return usableField(value) ? cleanCopy(value!) : null;
}

export function TeamSectionBody({
  section,
  playerEntries = [],
  teamAbbr,
}: Props) {
  const intro = cleanField(section.intro_paragraphs);
  const rookie = cleanField(section.rookie_paragraph);
  const activity = cleanField(section.activity_markdown);
  const fantasy = cleanField(section.fantasy_markdown);

  // Talk is retired: fold any legacy talk into activity display only if activity is empty.
  const legacyTalk = cleanField(section.talk_markdown);
  const activityOrTalk =
    activity ??
    (legacyTalk
      ? legacyTalk.replace(/^#{1,6}\s*Talk\s*$/gim, "### Activity").trim()
      : null);

  const sectionContext = [intro, rookie, activityOrTalk, fantasy]
    .filter(Boolean)
    .join("\n\n");
  const footnotes = (section.footnotes ?? []).filter((f) => f.label?.trim() || f.url?.trim());

  const lookup = useMemo(
    () => deserializePlayerLookup(playerEntries),
    [playerEntries]
  );

  const sharedMatcher = useMemo(
    () =>
      playerEntries.length > 0 && sectionContext
        ? buildChipMatcher(lookup, sectionContext, teamAbbr)
        : null,
    [lookup, playerEntries.length, sectionContext, teamAbbr]
  );

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
          sharedMatcher={sharedMatcher}
          contextText={sectionContext}
        />
      )}
      {rookie && (
        <>
          <h3>Rookies & camp additions</h3>
          <MarkdownBlock
            content={rookie}
            sharedMatcher={sharedMatcher}
            contextText={sectionContext}
          />
        </>
      )}
      {activityOrTalk && (
        <MarkdownBlock
          content={activityOrTalk}
          sharedMatcher={sharedMatcher}
          contextText={sectionContext}
        />
      )}
      {fantasy && (
        <MarkdownBlock
          content={fantasy}
          sharedMatcher={sharedMatcher}
          contextText={sectionContext}
        />
      )}
      {footnotes.length > 0 && <ReferencesDropdown footnotes={footnotes} />}
    </div>
  );
}
