import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import teamsData from "../../../../data/teams.json";

type Props = { params: Promise<{ slug: string }> };

export default async function TeamArchivePage({ params }: Props) {
  const { slug } = await params;
  const team = (teamsData as { slug: string; name: string }[]).find((t) => t.slug === slug);
  const supabase = createServerClient();

  const { data: teamRow } = await supabase.from("newsletter_teams").select("id").eq("slug", slug).maybeSingle();

  const { data: sections } = teamRow
    ? await supabase
        .from("newsletter_sections")
        .select("issue_id, newsletter_issues(issue_date, slug, title, status)")
        .eq("team_id", teamRow.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  return (
    <main>
      <h1>{team?.name ?? slug}</h1>
      <p>
        <Link href={`/issue/latest?team=${slug}`}>Latest issue</Link> (use dated URL when live)
      </p>
      <h2>Archive (published)</h2>
      <ul>
        {(sections ?? [])
          .filter((s) => {
            const issue = s.newsletter_issues as
              | { status: string }
              | { status: string }[]
              | null;
            const row = Array.isArray(issue) ? issue[0] : issue;
            return row?.status === "published";
          })
          .map((s) => {
            const raw = s.newsletter_issues as
              | { slug: string; title: string }
              | { slug: string; title: string }[];
            const issue = Array.isArray(raw) ? raw[0] : raw;
            if (!issue) return null;
            return (
              <li key={s.issue_id}>
                <Link href={`/issue/${issue.slug}?team=${slug}`}>{issue.title}</Link>
              </li>
            );
          })}
      </ul>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Full team-only archive pages will refine once issues are publishing regularly.
      </p>
    </main>
  );
}
