import Link from "next/link";
import { TeamSectionBody } from "@/components/TeamSectionBody";
import { formatIssueDate, type IssueSummary } from "@/lib/issues";
import { type TeamSectionContent } from "@/lib/sections";
import { weekRangeLabel, weekRecapSubtitle } from "@/lib/dates";
import { getTeams } from "@/lib/teams";

export type TeamArchiveEntry = {
  issue: IssueSummary;
  section: TeamSectionContent;
};

type Props = {
  entries: TeamArchiveEntry[];
  teamSlug: string;
  playerEntries: import("@/lib/playerRegistry").PlayerLookupEntry[];
  emptyMessage: string;
};

function EntryHeader({ issue }: { issue: IssueSummary }) {
  const isWeekly = issue.issue_type === "weekly";

  if (isWeekly) {
    return (
      <>
        <span className="edition-badge edition-weekly">Week in review</span>
        <div className="team-week-heading">
          <span className="team-day-date">{weekRangeLabel(issue.issue_date)}</span>
          <span className="team-week-subtitle">{weekRecapSubtitle(issue.issue_date)}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <span className="edition-badge edition-daily">Daily</span>
      <time dateTime={issue.issue_date} className="team-day-date">
        {formatIssueDate(issue.issue_date)}
      </time>
    </>
  );
}

export function TeamArchiveFeed({
  entries,
  teamSlug,
  playerEntries,
  emptyMessage,
}: Props) {
  const teamAbbr = getTeams().find((t) => t.slug === teamSlug)?.abbrev ?? null;
  if (entries.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="team-archive-feed">
      {entries.map(({ issue, section }) => {
        const isWeekly = issue.issue_type === "weekly";
        return (
          <article
            key={`${issue.slug}-${issue.issue_type}`}
            className={isWeekly ? "team-day-entry team-day-entry-weekly" : "team-day-entry"}
          >
            <header className="team-day-header">
              <div className="team-day-heading">
                <EntryHeader issue={issue} />
              </div>
              <Link
                href={`/issue/${issue.slug}?team=${teamSlug}`}
                className="team-day-full-issue"
              >
                {isWeekly ? "Full weekly digest" : "Full digest"}
              </Link>
            </header>
            <TeamSectionBody
              section={section}
              playerEntries={playerEntries}
              teamAbbr={teamAbbr}
            />
          </article>
        );
      })}
    </div>
  );
}
