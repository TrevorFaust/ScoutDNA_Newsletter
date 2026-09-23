"use client";

import { useMemo } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { ReferencesDropdown } from "@/components/ReferencesDropdown";
import { TeamUsagePanel } from "@/components/TeamUsagePanel";
import { cleanCopy } from "@/lib/cleanCopy";
import { usableField, type TeamSectionContent } from "@/lib/sections";
import type { PlayerWeekUsage } from "@/lib/playerUsage";
import { buildChipMatcher } from "@/lib/wrapPlayerNames";
import { deserializePlayerLookup } from "@/lib/playerRegistry";

type Props = {
  section: TeamSectionContent;
  playerEntries?: import("@/lib/playerRegistry").PlayerLookupEntry[];
  teamAbbr?: string | null;
  usageRows?: PlayerWeekUsage[];
  usageWeekLabel?: string;
};

function cleanField(value: string | null | undefined): string | null {
  return usableField(value) ? cleanCopy(value!) : null;
}

export function TeamSectionBody({
  section,
  playerEntries = [],
  teamAbbr,
  usageRows,
  usageWeekLabel,
}: Props) {
  const intro = cleanField(section.intro_paragraphs);
  const fantasy = cleanField(section.fantasy_markdown);

  // Rookie notes and Activity are retired for in-season editions: fantasy-first
  // shape is intro + Fantasy lens only. Keep unused fields out of the matcher
  // context so stale Activity copy cannot drive chips.
  const sectionContext = [intro, fantasy].filter(Boolean).join("\n\n");
  const footnotes = (section.footnotes ?? []).filter(
    (f) => f.label?.trim() || f.url?.trim()
  );

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
      {fantasy && (
        <MarkdownBlock
          content={fantasy}
          sharedMatcher={sharedMatcher}
          contextText={sectionContext}
        />
      )}
      {usageRows && usageRows.length > 0 ? (
        <TeamUsagePanel rows={usageRows} weekLabel={usageWeekLabel} />
      ) : null}
      {footnotes.length > 0 && <ReferencesDropdown footnotes={footnotes} />}
    </div>
  );
}
