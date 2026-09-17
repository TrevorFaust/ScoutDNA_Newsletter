import Link from "next/link";
import { IssueList } from "@/components/IssueList";
import { fetchIssues, fetchLatestIssue } from "@/lib/issues";

export const metadata = {
  title: "Daily Edition | ScoutDNA: All 32",
  description: "Daily NFL digest for all 32 teams: camp, injuries, depth charts, and rumors.",
};

export default async function DailyPage() {
  const [{ issues, error }, latest] = await Promise.all([
    fetchIssues("daily"),
    fetchLatestIssue("daily"),
  ]);

  const published = issues.filter((i) => i.status === "published").length;

  return (
    <main>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Daily</span>
      </nav>

      <header className="page-header">
        <span className="edition-badge edition-daily">Daily Edition</span>
        <h1>Daily digest</h1>
        <p className="page-lead">
          Every morning. League-wide opener plus all 32 team sections from the
          prior 24 hours: activity and fantasy angles when the news supports
          them.
        </p>
        {latest && (
          <Link href={`/issue/${latest.slug}`} className="btn btn-primary">
            Read latest daily
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
        emptyMessage="No daily issues yet. Run collect and compose to generate the first edition."
      />
    </main>
  );
}
