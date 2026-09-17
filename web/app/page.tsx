import Link from "next/link";
import { IssueCard } from "@/components/IssueCard";
import { fetchIssues, fetchLatestIssue } from "@/lib/issues";

export default async function HomePage() {
  const [
    { issues: allIssues, error },
    latestDaily,
    latestWeekly,
  ] = await Promise.all([
    fetchIssues(),
    fetchLatestIssue("daily"),
    fetchLatestIssue("weekly"),
  ]);

  const dailyCount = allIssues.filter((i) => i.issue_type === "daily").length;
  const weeklyCount = allIssues.filter((i) => i.issue_type === "weekly").length;
  const recent = allIssues.slice(0, 4);

  return (
    <main>
      <section className="hero">
        <p className="hero-eyebrow">Every team. Every day.</p>
        <h1 className="hero-title">ScoutDNA: All 32</h1>
        <p className="hero-lead">
          A structured NFL digest: camp moves, injuries, depth charts, and rumors
          with a fantasy lens. All 32 franchises, cited sources, one read.
        </p>
        <div className="hero-actions">
          {latestDaily && (
            <Link href={`/issue/${latestDaily.slug}`} className="btn btn-primary">
              Read today&apos;s edition
            </Link>
          )}
          <Link href="/teams" className="btn btn-secondary">
            Browse by team
          </Link>
        </div>
      </section>

      {error && (
        <p className="alert">
          Database error: {error.message}. Add SUPABASE_SERVICE_ROLE_KEY to web/.env.local
          and restart npm run dev.
        </p>
      )}

      <section className="edition-cards">
        <Link href="/daily" className="edition-card edition-card-daily">
          <span className="edition-card-label">Daily Edition</span>
          <span className="edition-card-count">{dailyCount} issues</span>
          <p className="edition-card-desc">
            Every morning. League lens plus all 32 team sections from the
            prior 24 hours.
          </p>
          {latestDaily && (
            <span className="edition-card-latest">Latest: {latestDaily.issue_date}</span>
          )}
        </Link>

        <Link href="/weekly" className="edition-card edition-card-weekly">
          <span className="edition-card-label">Week recaps</span>
          <span className="edition-card-count">{weeklyCount} issues</span>
          <p className="edition-card-desc">
            Tuesday recap after Monday Night Football. Week 1 recap, Week 2
            recap, and so on: who scored, how they were used, what is next.
          </p>
          {latestWeekly && (
            <span className="edition-card-latest">Latest: {latestWeekly.issue_date}</span>
          )}
        </Link>
      </section>

      {recent.length > 0 && (
        <section className="page-section">
          <div className="section-header">
            <h2>Recent issues</h2>
            <Link href="/daily" className="section-link">
              View all
            </Link>
          </div>
          <div className="issue-grid issue-grid-compact">
            {recent.map((issue) => (
              <IssueCard key={`${issue.slug}-${issue.issue_type}`} issue={issue} />
            ))}
          </div>
        </section>
      )}

      {!error && allIssues.length === 0 && (
        <p className="empty-state">
          No issues yet. Run collect, then compose (see README). Drafts appear here
          before publish.
        </p>
      )}

      <footer className="site-footer">
        <Link href="/signup">Subscribe</Link>
        <span aria-hidden="true">·</span>
        <Link href="/preferences">Preferences</Link>
      </footer>
    </main>
  );
}
