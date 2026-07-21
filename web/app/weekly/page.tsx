import Link from "next/link";
import { IssueList } from "@/components/IssueList";
import { fetchIssues, fetchLatestIssue } from "@/lib/issues";

export const metadata = {
  title: "Weekly Edition | ScoutDNA: All 32",
  description: "Monday NFL week-in-review for all 32 teams.",
};

export default async function WeeklyPage() {
  const [{ issues, error }, latest] = await Promise.all([
    fetchIssues("weekly"),
    fetchLatestIssue("weekly"),
  ]);

  const published = issues.filter((i) => i.status === "published").length;

  return (
    <main>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Weekly</span>
      </nav>

      <header className="page-header">
        <span className="edition-badge edition-weekly">Weekly Edition</span>
        <h1>Week in review</h1>
        <p className="page-lead">
          Monday recaps. The prior calendar week compressed into one issue: what
          moved across the league, team by team, with the same cited structure as
          the daily digest.
        </p>
        {latest && (
          <Link href={`/issue/${latest.slug}`} className="btn btn-primary">
            Read latest weekly
          </Link>
        )}
      </header>

      {error && (
        <p className="alert">
          Database error: {error.message}. Add SUPABASE_SERVICE_ROLE_KEY to web/.env.local.
        </p>
      )}

      <div className="archive-stats">
        <span>{issues.length} total</span>
        <span>{published} published</span>
      </div>

      <IssueList
        issues={issues}
        emptyMessage="No weekly issues yet. Weekly compose runs on Mondays after the daily pipeline."
      />
    </main>
  );
}
