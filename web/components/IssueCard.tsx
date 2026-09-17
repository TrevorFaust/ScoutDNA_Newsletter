import Link from "next/link";
import { cleanCopy, formatIssueDate, statusLabel, type IssueSummary } from "@/lib/issues";
import { weeklyEditionLabel } from "@/lib/dates";

type Props = {
  issue: IssueSummary;
  teamSlug?: string;
};

export function IssueCard({ issue, teamSlug }: Props) {
  const href = teamSlug
    ? `/issue/${issue.slug}?team=${teamSlug}`
    : `/issue/${issue.slug}`;

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
        <Link href={href}>{cleanCopy(issue.title)}</Link>
      </h3>
      {issue.status !== "published" && (
        <span className={`status-pill status-${issue.status}`}>
          {statusLabel(issue.status)}
        </span>
      )}
      {issue.status === "collected" && (
        <p className="issue-card-hint">Run compose to generate text.</p>
      )}
    </article>
  );
}
