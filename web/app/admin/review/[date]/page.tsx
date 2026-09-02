import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { cleanCopy, formatIssueDate, statusLabel } from "@/lib/issues";
import { PublishIssueForm } from "@/components/PublishIssueForm";
import { RumorReviewPanel } from "@/components/RumorReviewPanel";

type Props = { params: Promise<{ date: string }> };

function teamFromSection(s: { newsletter_teams: unknown }): { name: string; slug: string } {
  const team = s.newsletter_teams as
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
  const t = Array.isArray(team) ? team[0] : team;
  return t ?? { name: "Team", slug: "" };
}

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: Props) {
  const { date } = await params;
  const supabase = createServerClient();

  const { data: issue } = await supabase
    .from("newsletter_issues")
    .select("*")
    .eq("slug", date)
    .maybeSingle();

  if (!issue) {
    return (
      <main className="camp-admin">
        <p className="camp-admin-eyebrow">Admin</p>
        <h1>Review</h1>
        <p>No draft for {date}.</p>
        <p>
          <Link href="/admin/rumors">← Back to Rumors</Link>
        </p>
      </main>
    );
  }

  const { data: sections } = await supabase
    .from("newsletter_sections")
    .select(
      "id, flags, activity_markdown, talk_markdown, sort_order, newsletter_teams(name, slug)"
    )
    .eq("issue_id", issue.id)
    .order("sort_order");

  const sectionRows = (sections ?? []).map((s) => {
    const t = teamFromSection(s);
    return {
      id: s.id as string,
      flags: (s.flags as string[]) ?? [],
      activity_markdown: s.activity_markdown as string | null,
      talk_markdown: s.talk_markdown as string | null,
      newsletter_teams: t,
    };
  });

  const pendingRumors = sectionRows.filter((s) =>
    s.flags.includes("review:rumor")
  ).length;

  const flagged = sectionRows.filter((s) =>
    s.flags.some(
      (f) =>
        f.includes("review") ||
        f.includes("rumor") ||
        f.includes("empty") ||
        f === "parse:error"
    )
  );

  return (
    <main className="camp-admin">
      <header className="camp-admin-header">
        <div>
          <p className="camp-admin-eyebrow">
            <Link href="/admin/rumors">Rumors</Link>
            {" · "}
            {issue.issue_type === "weekly" ? "Weekly" : "Daily"}
          </p>
          <h1>{cleanCopy(issue.title)}</h1>
          <p className="camp-admin-lead">
            {formatIssueDate(issue.issue_date)} · {statusLabel(issue.status)} ·{" "}
            {pendingRumors === 0
              ? "No pending rumors"
              : `${pendingRumors} team${pendingRumors === 1 ? "" : "s"} to review`}
          </p>
        </div>
        <div className="rumor-review-actions">
          <Link href={`/issue/${date}`} className="btn btn-secondary">
            Preview issue
          </Link>
          <Link href={`/admin/drafts/${date}`} className="btn btn-secondary">
            External drafts
          </Link>
          {issue.status !== "published" ? (
            <PublishIssueForm
              issueId={issue.id}
              slug={date}
              label="Publish"
            />
          ) : (
            <span className="camp-admin-muted">Published</span>
          )}
        </div>
      </header>

      {pendingRumors > 0 && (
        <p className="camp-admin-muted rumor-publish-hint">
          Clear all rumor flags before publishing, or preview the full issue first.
        </p>
      )}

      <section className="camp-admin-card">
        <h2>Team rumors ({pendingRumors})</h2>
        <p className="camp-admin-muted">
          Confirm keeps the Talk wording and clears the review badge. Reject
          opens a comment box — note what to keep or cut (e.g. drop only the
          fourth bullet), then rewrite, strip, or edit manually.
        </p>
        <RumorReviewPanel sections={sectionRows} />
      </section>

      <section className="camp-admin-card">
        <h2>Other flags ({flagged.length})</h2>
        {flagged.length === 0 ? (
          <p className="camp-admin-muted">
            No flags. Still skim injuries before publishing.
          </p>
        ) : (
          <ul className="rumor-flag-list">
            {flagged.map((s) => (
              <li key={s.id}>
                <Link href={`/issue/${date}?team=${s.newsletter_teams.slug}#${s.newsletter_teams.slug}`}>
                  {s.newsletter_teams.name}
                </Link>
                <span className="camp-admin-muted">
                  {" — "}
                  {s.flags.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="camp-admin-card">
        <h2>External drafts</h2>
        <p className="camp-admin-muted">
          Substack and Reddit draft creation lives on its own admin page so it
          stays available after you publish.
        </p>
        <div className="rumor-review-actions">
          <Link href={`/admin/drafts/${date}`} className="btn">
            Create Substack + Reddit drafts
          </Link>
          <Link href="/admin/drafts" className="btn btn-secondary">
            All editions
          </Link>
        </div>
      </section>
    </main>
  );
}
