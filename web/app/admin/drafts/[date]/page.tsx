import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { cleanCopy, formatIssueDate, statusLabel } from "@/lib/issues";
import { CreateDraftsPanel } from "@/components/CreateDraftsPanel";

type Props = { params: Promise<{ date: string }> };

export const dynamic = "force-dynamic";

export default async function ExternalDraftsEditionPage({ params }: Props) {
  const { date } = await params;
  const supabase = createServerClient();

  const { data: issue } = await supabase
    .from("newsletter_issues")
    .select("id, title, issue_date, issue_type, status, slug")
    .eq("slug", date)
    .maybeSingle();

  if (!issue) {
    return (
      <main className="camp-admin">
        <p className="camp-admin-eyebrow">Admin</p>
        <h1>External drafts</h1>
        <p>No edition for {date}.</p>
        <p>
          <Link href="/admin/drafts">← Back to drafts</Link>
        </p>
      </main>
    );
  }

  const { data: rumorRows } = await supabase
    .from("newsletter_sections")
    .select("id")
    .eq("issue_id", issue.id)
    .filter("flags", "cs", '["review:rumor"]');

  const pendingRumors = rumorRows?.length ?? 0;

  return (
    <main className="camp-admin">
      <header className="camp-admin-header">
        <div>
          <p className="camp-admin-eyebrow">
            <Link href="/admin/drafts">External drafts</Link>
            {" · "}
            {issue.issue_type === "weekly" ? "Weekly" : "Daily"}
          </p>
          <h1>{cleanCopy(issue.title)}</h1>
          <p className="camp-admin-lead">
            {formatIssueDate(issue.issue_date)} · {statusLabel(issue.status)} ·{" "}
            {pendingRumors === 0
              ? "Ready for Substack + Reddit drafts"
              : `${pendingRumors} rumor flag${pendingRumors === 1 ? "" : "s"} still open`}
          </p>
        </div>
        <div className="rumor-review-actions">
          <Link href={`/issue/${date}`} className="btn btn-secondary">
            Open issue
          </Link>
          <Link href={`/admin/review/${date}`} className="btn btn-secondary">
            Rumor review
          </Link>
        </div>
      </header>

      <CreateDraftsPanel issueId={issue.id} pendingRumors={pendingRumors} />
    </main>
  );
}
