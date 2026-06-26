import { IssueView } from "@/components/IssueView";
import { createServerClient } from "@/lib/supabase";
import {
  fetchPlayerPositionLookup,
  serializePlayerLookup,
} from "@/lib/playerRegistry";

type Props = {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ team?: string }>;
};

export default async function IssuePage({ params, searchParams }: Props) {
  const { date } = await params;
  const { team: teamParam } = await searchParams;
  const supabase = createServerClient();

  const { data: issue } = await supabase
    .from("newsletter_issues")
    .select("*")
    .eq("slug", date)
    .maybeSingle();

  if (!issue) {
    return (
      <main>
        <h1>Issue not found</h1>
        <p>No newsletter for {date}.</p>
      </main>
    );
  }

  const { data: sections } = await supabase
    .from("newsletter_sections")
    .select("*, newsletter_teams(slug, name, abbrev)")
    .eq("issue_id", issue.id)
    .order("sort_order");

  const favorite = teamParam ?? undefined;

  const playerLookup = await fetchPlayerPositionLookup(supabase);
  const playerEntries = serializePlayerLookup(playerLookup);

  return (
    <IssueView
      title={issue.title}
      status={issue.status}
      issueDate={date}
      leagueSection={issue.league_section}
      leagueFootnotes={
        (issue.league_footnotes as { n: number; label: string; url: string }[]) ?? []
      }
      sections={((sections ?? []) as { teams?: unknown; newsletter_teams?: unknown }[]).map(
        (s) => ({ ...s, teams: (s as { newsletter_teams?: object }).newsletter_teams ?? s.teams })
      ) as Parameters<typeof IssueView>[0]["sections"]}
      favoriteTeamSlug={favorite}
      playerEntries={playerEntries}
    />
  );
}
