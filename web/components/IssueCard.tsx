import Link from "next/link";
import { formatIssueDate, statusLabel, type IssueSummary } from "@/lib/issues";
import { weeklyEditionLabel } from "@/lib/dates";
import { displayIssueTitle, issueDeck, issueHook } from "@/lib/issueTitle";

type Props = {
  issue: IssueSummary;
  teamSlug?: string;
  isAdmin?: boolean;
};

export function IssueCard({ issue, teamSlug, isAdmin = false }: Props) {
  const href = teamSlug
    ? `/issue/${issue.slug}?team=${teamSlug}`
    : `/issue/${issue.slug}`;
  const hook = issueHook(issue);
  const deck = issueDeck(issue);
  const label = displayIssueTitle(issue);

  return (
    <article className="issue-card">
      <div className="issue-card-meta">
        <span className={`edition-badge edition-${issue.issue_type}`}>
          {issue.issue_type === "weekly"
            ? weeklyEditionLabel(issue.issue_date)
            : "Daily"}
        </span>
        <time dateTime={issue.issue_date}>{formatIssueDate(issue.issue_date)}</time>
      </div>
      <h3 className="issue-card-title">
        <Link href={href}>{label}</Link>
      </h3>
      {hook ? <p className="issue-card-hook">{hook}</p> : null}
      {deck ? <p className="issue-card-deck">{deck}</p> : null}
      {issue.status !== "published" && (
        <span className={`status-pill status-${issue.status}`}>
          {statusLabel(issue.status)}
        </span>
      )}
      {issue.status === "collected" && (
        <p className="issue-card-hint">Run compose to generate text.</p>
      )}
      {isAdmin && issue.status !== "published" && (
        <p className="issue-card-hint">
          <Link href={`/admin/review/${issue.slug}`}>Review this edition</Link>
        </p>
      )}
      <div className="issue-card-foot" aria-hidden="true">
        <span className="issue-card-cta">Read recap</span>
      </div>
    </article>
  );
}
