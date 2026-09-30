import { IssueCard } from "@/components/IssueCard";
import type { IssueSummary } from "@/lib/issues";

type Props = {
  issues: IssueSummary[];
  emptyMessage: string;
  teamSlug?: string;
  showDrafts?: boolean;
  isAdmin?: boolean;
};

export function IssueList({
  issues,
  emptyMessage,
  teamSlug,
  showDrafts = true,
  isAdmin = false,
}: Props) {
  const visible = showDrafts
    ? issues
    : issues.filter((i) => i.status === "published");

  if (visible.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="issue-grid">
      {visible.map((issue) => (
        <IssueCard
          key={`${issue.slug}-${issue.issue_type}`}
          issue={issue}
          teamSlug={teamSlug}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
}
