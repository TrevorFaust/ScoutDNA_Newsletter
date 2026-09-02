import Link from "next/link";
import { cleanCopy, formatIssueDate, statusLabel } from "@/lib/issues";
import { fetchIssuesForExternalDrafts } from "@/lib/rumors";

export const dynamic = "force-dynamic";

export default async function ExternalDraftsIndexPage() {
  const { issues, error } = await fetchIssuesForExternalDrafts();
  const ready = issues.filter((i) => i.pending_rumors === 0);
  const blocked = issues.filter((i) => i.pending_rumors > 0);

  return (
    <main className="camp-admin">
      <header className="camp-admin-header">
        <div>
          <p className="camp-admin-eyebrow">Admin</p>
          <h1>External drafts</h1>
          <p className="camp-admin-lead">
            Create Substack and Reddit drafts for an edition. Nothing posts live
            — you review and publish on each site yourself.
          </p>
        </div>
        <div className="usage-header-links">
          <Link href="/admin/rumors" className="btn btn-secondary">
            Rumors
          </Link>
          <Link href="/admin/usage" className="btn btn-secondary">
            Usage
          </Link>
        </div>
      </header>

      {error && (
        <p className="alert">Could not load editions: {error.message}</p>
      )}

      <section className="camp-admin-card">
        <h2>Ready ({ready.length})</h2>
        <p className="camp-admin-muted">
          No pending rumor flags. Open an edition to create Substack and Reddit
          drafts.
        </p>
        {ready.length === 0 ? (
          <p className="camp-admin-muted">
            No cleared editions yet. Finish rumor review first, then come back
            here — published editions stay listed.
          </p>
        ) : (
          <ul className="rumor-edition-list">
            {ready.map((issue) => (
              <li key={issue.slug}>
                <Link
                  href={`/admin/drafts/${issue.slug}`}
                  className="rumor-edition-row rumor-edition-row-clear"
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
                  <span className="rumor-edition-count rumor-edition-count-zero">
                    Go
                    <span className="rumor-edition-count-label">drafts</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {blocked.length > 0 && (
        <section className="camp-admin-card">
          <h2>Blocked by rumors ({blocked.length})</h2>
          <p className="camp-admin-muted">
            Clear rumor flags on the review page before creating external
            drafts.
          </p>
          <ul className="rumor-edition-list">
            {blocked.map((issue) => (
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
                  <span
                    className="rumor-edition-count"
                    aria-label={`${issue.pending_rumors} teams with rumors`}
                  >
                    {issue.pending_rumors}
                    <span className="rumor-edition-count-label">
                      {issue.pending_rumors === 1 ? "team" : "teams"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
