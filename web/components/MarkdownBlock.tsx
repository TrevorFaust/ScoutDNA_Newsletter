"use client";

import ReactMarkdown from "react-markdown";
import { normalizeInlineCitations } from "@/lib/citations";
import { cleanCopy } from "@/lib/cleanCopy";
import {
  buildChipMatcher,
  createChipSession,
  renderChildrenWithPlayerChips,
  type ChipMatcher,
} from "@/lib/wrapPlayerNames";
import { deserializePlayerLookup, type PlayerLookupEntry } from "@/lib/playerRegistry";
import { useMemo } from "react";

type Props = {
  content: string;
  /** From fetchPlayerPositionLookup — serialized entries */
  playerEntries?: PlayerLookupEntry[];
  /**
   * Concatenated markdown of the whole surrounding section. Used to resolve
   * bare surnames ("Verse" -> Jared Verse) when the full name appears in a
   * sibling block. Defaults to this block's own content.
   */
  contextText?: string;
  /** Optional shared matcher built once per team section. */
  sharedMatcher?: ChipMatcher | null;
  /** Team abbrev so Higgins/Reed/etc. resolve to this club, not a namesake. */
  teamAbbr?: string | null;
};

/**
 * Fresh session per paragraph / list item so the first mention in that piece
 * of news gets a badge, but later bullets about the same player still chip.
 * Do not share a mutable Set across components — Strict Mode double-renders
 * would skip chips on the second pass and break hydration.
 */
function chipComponents(matcher: ChipMatcher) {
  return {
    p: ({ children }: { children?: React.ReactNode }) => {
      const session = createChipSession();
      return <p>{renderChildrenWithPlayerChips(children, matcher, session)}</p>;
    },
    li: ({ children }: { children?: React.ReactNode }) => {
      const session = createChipSession();
      return <li>{renderChildrenWithPlayerChips(children, matcher, session)}</li>;
    },
  };
}

export function MarkdownBlock({
  content,
  playerEntries = [],
  contextText,
  sharedMatcher,
  teamAbbr,
}: Props) {
  const normalized = cleanCopy(normalizeInlineCitations(content));
  const lookup = useMemo(
    () => deserializePlayerLookup(playerEntries),
    [playerEntries]
  );

  const localMatcher = useMemo(() => {
    if (sharedMatcher) return null;
    if (playerEntries.length === 0) return null;
    return buildChipMatcher(lookup, contextText ?? content, teamAbbr);
  }, [sharedMatcher, playerEntries.length, lookup, contextText, content, teamAbbr]);

  const matcher = sharedMatcher ?? localMatcher;

  const components = useMemo(
    () => (matcher ? chipComponents(matcher) : undefined),
    [matcher]
  );

  return (
    <div className="prose-team">
      <ReactMarkdown components={components}>{normalized}</ReactMarkdown>
    </div>
  );
}
