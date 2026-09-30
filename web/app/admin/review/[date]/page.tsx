import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { formatIssueDate, statusLabel } from "@/lib/issues";
import { displayIssueTitle } from "@/lib/issueTitle";
import { CreateDraftsPanel } from "@/components/CreateDraftsPanel";
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
  await requireAdmin(`/admin/review/${date}`);
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
          <Link href="/weekly">← Back to Weekly</Link>
        </p>
      </main>
    );
  }

  const { data: sections } = await supabase
    .from("newsletter_sections")
    .select(
      "id, flags, activity_markdown, talk_markdown, intro_paragraphs, fantasy_markdown, footnotes, sort_order, newsletter_teams(name, slug)"
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
      intro_paragraphs: s.intro_paragraphs as string | null,
      fantasy_markdown: s.fantasy_markdown as string | null,
      footnotes: (s.footnotes as { n: number; label: string; url?: string }[] | null) ?? [],
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
            <Link href="/weekly">Weekly</Link>
            {" · "}
            Review
          </p>
          <h1>
            {displayIssueTitle({
              title: issue.title,
              issue_date: String(issue.issue_date).slice(0, 10),
              issue_type: issue.issue_type,
            })}
          </h1>
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
          Clear all rumor flags before publishing or creating Substack and Reddit drafts.
        </p>
      )}

      <section className="camp-admin-card">
        <h2>Team rumors ({pendingRumors})</h2>
        <p className="camp-admin-muted">
          Confirm keeps the wording and clears the review badge. Reject
          opens a comment box. Note what to keep or cut (for example, drop
          only the trade note), then rewrite, strip, or edit manually.
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

      <CreateDraftsPanel issueId={issue.id} pendingRumors={pendingRumors} />
    </main>
  );
}
