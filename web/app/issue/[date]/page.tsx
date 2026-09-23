import { IssueView } from "@/components/IssueView";
import { nflWeekNumber } from "@/lib/dates";
import { createServerClient } from "@/lib/supabase";
import { fetchAdjacentIssues } from "@/lib/issues";
import {
  fetchPlayerPositionLookup,
  serializePlayerLookup,
} from "@/lib/playerRegistry";
import { fetchUsageForWeek, usageByTeamAbbr } from "@/lib/playerUsage";

type Props = {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ team?: string }>;
};

export const dynamic = "force-dynamic";

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

  const adjacent = await fetchAdjacentIssues(
    issue.issue_date,
    issue.issue_type as "daily" | "weekly"
  );

  const issueDateIso = String(issue.issue_date).slice(0, 10);
  const weekNum =
    issue.issue_type === "weekly" ? nflWeekNumber(issueDateIso) : null;
  let usageByTeam: ReturnType<typeof usageByTeamAbbr> | undefined;
  let usageWeekLabel: string | undefined;
  if (weekNum) {
    try {
      const rows = await fetchUsageForWeek({
        season: 2026,
        seasonType: "REG",
        week: weekNum,
      });
      usageByTeam = usageByTeamAbbr(rows);
      usageWeekLabel = `Week ${weekNum}`;
    } catch {
      usageByTeam = undefined;
    }
  }

  return (
    <IssueView
      title={issue.title}
      status={issue.status}
      issueId={issue.id}
      issueType={issue.issue_type as "daily" | "weekly"}
      issueDate={date}
      leagueSection={issue.league_section}
      leagueFootnotes={
        (issue.league_footnotes as { n: number; label: string; url: string }[]) ??
        []
      }
      sections={(
        (sections ?? []) as { teams?: unknown; newsletter_teams?: unknown }[]
      ).map((s) => ({
        ...s,
        teams:
          (s as { newsletter_teams?: object }).newsletter_teams ?? s.teams,
      })) as Parameters<typeof IssueView>[0]["sections"]}
      favoriteTeamSlug={favorite}
      playerEntries={playerEntries}
      adjacentPrev={adjacent.prev}
      adjacentNext={adjacent.next}
      usageByTeam={usageByTeam}
      usageWeekLabel={usageWeekLabel}
    />
  );
}
