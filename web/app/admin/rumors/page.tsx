import Link from "next/link";
import { cleanCopy, formatIssueDate, statusLabel } from "@/lib/issues";
import { fetchIssuesWithRumorCounts } from "@/lib/rumors";

export const dynamic = "force-dynamic";

export default async function RumorsAdminPage() {
  const { issues, error } = await fetchIssuesWithRumorCounts();
  const withPending = issues.filter((i) => i.pending_rumors > 0);
  const cleared = issues.filter((i) => i.pending_rumors === 0);

  return (
    <main className="camp-admin">
      <header className="camp-admin-header">
        <div>
          <p className="camp-admin-eyebrow">Admin</p>
          <h1>Rumors</h1>
          <p className="camp-admin-lead">
            Pick an edition, then confirm or reject each flagged team without
            scrolling the full issue. Approve clears the review badge; reject
            can strip or rewrite Talk.
          </p>
        </div>
        <div className="usage-header-links">
          <Link href="/admin/drafts" className="btn">
            External drafts
          </Link>
          <Link href="/admin/usage" className="btn btn-secondary">
            Usage
          </Link>
          <Link href="/admin/camp-signals" className="btn btn-secondary">
            Camp signals
          </Link>
        </div>
      </header>

      {error && (
        <p className="alert">Could not load editions: {error.message}</p>
      )}

      <section className="camp-admin-card">
        <h2>Needs review ({withPending.length})</h2>
        <p className="camp-admin-muted">
          Editions with at least one team still carrying a{" "}
          <code>review:rumor</code> flag.
        </p>
        {withPending.length === 0 ? (
          <p className="camp-admin-muted">
            No pending rumor queues. Compose a weekly or daily draft, or clear
            what&apos;s already in review.
          </p>
        ) : (
          <ul className="rumor-edition-list">
            {withPending.map((issue) => (
              <li key={issue.slug}>
                <Link
                  href={`/admin/review/${issue.slug}`}
                  className="rumor-edition-row"
                >
                  <div className="rumor-edition-main">
                    <span className="rumor-edition-title">
                      {cleanCopy(issue.title)}
                    </span>
                    <span className="rumor-edition-meta">
                      {formatIssueDate(issue.issue_date)} ·{" "}
                      {issue.issue_type === "weekly" ? "Weekly" : "Daily"} ·{" "}
                      {statusLabel(issue.status)}
                    </span>
                  </div>
                  <span className="rumor-edition-count" aria-label={`${issue.pending_rumors} teams with rumors`}>
                    {issue.pending_rumors}
                    <span className="rumor-edition-count-label">
                      {issue.pending_rumors === 1 ? "team" : "teams"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cleared.length > 0 && (
        <section className="camp-admin-card">
          <h2>Cleared / ready to publish ({cleared.length})</h2>
          <p className="camp-admin-muted">
            No pending rumor flags. Open to publish, or go to{" "}
            <Link href="/admin/drafts">External drafts</Link> for Substack and
            Reddit (published editions stay there).
          </p>
          <ul className="rumor-edition-list">
            {cleared.map((issue) => (
              <li key={issue.slug}>
                <div className="rumor-edition-row rumor-edition-row-clear">
                  <Link
                    href={`/admin/review/${issue.slug}`}
                    className="rumor-edition-main"
                  >
                    <span className="rumor-edition-title">
                      {cleanCopy(issue.title)}
                    </span>
                    <span className="rumor-edition-meta">
                      {formatIssueDate(issue.issue_date)} ·{" "}
                      {issue.issue_type === "weekly" ? "Weekly" : "Daily"} ·{" "}
                      {statusLabel(issue.status)}
                    </span>
                  </Link>
                  <div className="rumor-edition-side">
                    <Link
                      href={`/admin/drafts/${issue.slug}`}
                      className="btn btn-secondary"
                    >
                      Drafts
                    </Link>
                    <span className="rumor-edition-count rumor-edition-count-zero">
                      0
                      <span className="rumor-edition-count-label">pending</span>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
