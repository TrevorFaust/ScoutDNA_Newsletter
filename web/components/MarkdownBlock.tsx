"use client";

import ReactMarkdown from "react-markdown";
import { normalizeInlineCitations } from "@/lib/citations";
import {
  buildChipMatcher,
  createChipSession,
  renderChildrenWithPlayerChips,
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
};

export function MarkdownBlock({ content, playerEntries = [], contextText }: Props) {
  const normalized = normalizeInlineCitations(content);
  const lookup = useMemo(
    () => deserializePlayerLookup(playerEntries),
    [playerEntries]
  );

  const hasPlayers = playerEntries.length > 0;

  const matcher = useMemo(
    () => (hasPlayers ? buildChipMatcher(lookup, contextText ?? content) : null),
    [hasPlayers, lookup, contextText, content]
  );

  const components = useMemo(() => {
    if (!matcher) return undefined;
    return {
      p: ({ children }: { children?: React.ReactNode }) => (
        <p>{renderChildrenWithPlayerChips(children, matcher, createChipSession())}</p>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li>{renderChildrenWithPlayerChips(children, matcher, createChipSession())}</li>
      ),
    };
  }, [matcher]);

  return (
    <div className="prose-team">
      <ReactMarkdown components={components}>{normalized}</ReactMarkdown>
    </div>
  );
}
