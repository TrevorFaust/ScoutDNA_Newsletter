import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { cleanCopy } from "@/lib/issues";
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
      <main>
        <h1>Review</h1>
        <p>No draft for {date}.</p>
      </main>
    );
  }

  const { data: sections } = await supabase
    .from("newsletter_sections")
    .select("id, flags, talk_markdown, sort_order, newsletter_teams(name, slug)")
    .eq("issue_id", issue.id)
    .order("sort_order");

  const flagged = (sections ?? []).filter((s) =>
    (s.flags as string[])?.some(
      (f) =>
        f.includes("review") ||
        f.includes("rumor") ||
        f.includes("empty") ||
        f === "parse:error"
    )
  );

  return (
    <main>
      <h1>Review: {cleanCopy(issue.title)}</h1>
      <p>
        Status: <strong>{issue.status}</strong>
      </p>
      <p>
        <Link href={`/issue/${date}`}>Preview issue</Link>
        {" · "}
        <Link href="/admin/camp-signals">Camp signals</Link>
      </p>
      <form action={`/api/publish`} method="post" style={{ margin: "1rem 0" }}>
        <input type="hidden" name="issueId" value={issue.id} />
        <input type="hidden" name="slug" value={date} />
        <button type="submit" className="btn">
          Approve & publish
        </button>
      </form>

      <h2>Rumor review</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Approve rumors to clear the draft flag. Published sections keep rumor wording in Talk but
        lose the review badge.
      </p>
      <RumorReviewPanel
        sections={(sections ?? []).map((s) => {
          const t = teamFromSection(s);
          return {
            id: s.id as string,
            flags: (s.flags as string[]) ?? [],
            talk_markdown: s.talk_markdown as string | null,
            newsletter_teams: t,
          };
        })}
      />

      <h2>Other flags ({flagged.length})</h2>
      <ul>
        {flagged.map((s) => {
          const t = teamFromSection(s);
          return (
          <li key={s.id}>
            <Link href={`/issue/${date}?team=${t.slug}#${t.slug}`}>
              {t.name}
            </Link>
            : {(s.flags as string[])?.join(", ")}
          </li>
          );
        })}
      </ul>
      {flagged.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No flags. Still skim injuries before publishing.</p>
      )}
    </main>
  );
}
