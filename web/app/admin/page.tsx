import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fetchIssues } from "@/lib/issues";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Desk | ScoutDNA: All 32",
};

export default async function AdminDeskPage() {
  await requireAdmin("/admin");
  const { issues } = await fetchIssues("weekly", { includeDrafts: true });
  const drafts = issues.filter((i) => i.status !== "published").slice(0, 6);

  return (
    <main className="camp-admin">
      <header className="camp-admin-header">
        <div>
          <p className="camp-admin-eyebrow">Editor</p>
          <h1>Desk</h1>
          <p className="camp-admin-lead">
            Review rumors, approve camp signals, and upload Substack or Reddit
            drafts. Readers never see these tools.
          </p>
        </div>
      </header>

      <section className="camp-admin-card">
        <h2>Drafts</h2>
        {drafts.length === 0 ? (
          <p className="camp-admin-muted">No unpublished recaps right now.</p>
        ) : (
          <ul className="rumor-flag-list">
            {drafts.map((issue) => (
              <li key={issue.slug}>
                <Link href={`/admin/review/${issue.slug}`}>{issue.slug}</Link>
                <span className="camp-admin-muted"> — {issue.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="camp-admin-card">
        <h2>Tools</h2>
        <p className="desk-tool-row">
          <Link href="/admin/camp-signals" className="btn btn-secondary">
            Camp signals
          </Link>
          <Link href="/admin/usage" className="btn btn-secondary">
            Usage
          </Link>
          <Link href="/weekly" className="btn btn-secondary">
            Weekly archive
          </Link>
        </p>
      </section>
    </main>
  );
}
