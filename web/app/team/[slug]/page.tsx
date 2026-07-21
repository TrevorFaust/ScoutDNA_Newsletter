import Link from "next/link";
import { TeamArchiveFeed, type TeamArchiveEntry } from "@/components/TeamArchiveFeed";
import { createServerClient } from "@/lib/supabase";
import { type IssueSummary } from "@/lib/issues";
import { sectionHasContent, type TeamSectionContent } from "@/lib/sections";
import {
  fetchPlayerPositionLookup,
  serializePlayerLookup,
} from "@/lib/playerRegistry";
import teamsData from "../../../../data/teams.json";

type Props = { params: Promise<{ slug: string }> };

type TeamMeta = { slug: string; name: string; conference: string; division: string };

type SectionRow = TeamSectionContent & {
  newsletter_issues:
    | IssueSummary
    | IssueSummary[]
    | null;
};

function toArchiveEntry(row: SectionRow): TeamArchiveEntry | null {
  const raw = row.newsletter_issues;
  const issue = Array.isArray(raw) ? raw[0] : raw;
  if (!issue || !["published", "in_review", "approved"].includes(issue.status)) {
    return null;
  }
  if (!sectionHasContent(row)) return null;

  const { newsletter_issues: _, ...section } = row;
  return { issue, section };
}

export default async function TeamArchivePage({ params }: Props) {
  const { slug } = await params;
  const team = (teamsData as TeamMeta[]).find((t) => t.slug === slug);
  const supabase = createServerClient();

  const { data: teamRow } = await supabase
    .from("newsletter_teams")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const { data: sections } = teamRow
    ? await supabase
        .from("newsletter_sections")
        .select(
          `intro_paragraphs, rookie_paragraph, activity_markdown, talk_markdown, fantasy_markdown,
           footnotes, tags, flags, is_empty, empty_reason,
           newsletter_issues(issue_date, slug, title, status, issue_type, published_at)`
        )
        .eq("team_id", teamRow.id)
        .order("issue_date", { foreignTable: "newsletter_issues", ascending: false })
        .limit(120)
    : { data: [] };

  const playerLookup = await fetchPlayerPositionLookup(supabase);
  const playerEntries = serializePlayerLookup(playerLookup);

  const entries = (sections ?? [])
    .map((s) => toArchiveEntry(s as SectionRow))
    .filter((e): e is TeamArchiveEntry => e !== null)
    .sort((a, b) => b.issue.issue_date.localeCompare(a.issue.issue_date));

  return (
    <main>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/teams">Teams</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{team?.name ?? slug}</span>
      </nav>

      <header className="page-header">
        {team && (
          <p className="team-division-label">
            {team.conference} {team.division}
          </p>
        )}
        <h1>{team?.name ?? slug}</h1>
        <p className="page-lead">
          Reported news for this franchise, newest first. Daily editions and Monday
          week-in-review recaps appear together; quiet days with nothing to report
          are omitted.
        </p>
      </header>

      <section className="page-section">
        <TeamArchiveFeed
          entries={entries}
          teamSlug={slug}
          playerEntries={playerEntries}
          emptyMessage="No published coverage for this team yet."
        />
      </section>
    </main>
  );
}
