"use client";

import Link from "next/link";
import { formatIssueDate, type AdjacentIssue } from "@/lib/issues";

type Props = {
  prev: AdjacentIssue | null;
  next: AdjacentIssue | null;
  teamSlug?: string | null;
};

function issueHref(slug: string, teamSlug?: string | null) {
  const base = `/issue/${slug}`;
  return teamSlug ? `${base}?team=${teamSlug}` : base;
}

export function IssueAdjacentNav({ prev, next, teamSlug }: Props) {
  if (!prev && !next) return null;

  return (
    <nav className="issue-adjacent-nav" aria-label="Adjacent issues">
      {prev ? (
        <Link href={issueHref(prev.slug, teamSlug)} className="issue-adjacent-link issue-adjacent-prev">
          <span className="issue-adjacent-arrow" aria-hidden="true">
            ←
          </span>
          <span className="issue-adjacent-label">
            <span className="issue-adjacent-dir">Previous</span>
            <span className="issue-adjacent-date">{formatIssueDate(prev.issue_date)}</span>
          </span>
        </Link>
      ) : (
        <span className="issue-adjacent-spacer" />
      )}
      {next ? (
        <Link href={issueHref(next.slug, teamSlug)} className="issue-adjacent-link issue-adjacent-next">
          <span className="issue-adjacent-label">
            <span className="issue-adjacent-dir">Next</span>
            <span className="issue-adjacent-date">{formatIssueDate(next.issue_date)}</span>
          </span>
          <span className="issue-adjacent-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      ) : (
        <span className="issue-adjacent-spacer" />
      )}
    </nav>
  );
}
