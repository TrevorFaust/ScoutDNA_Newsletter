import { IssueView } from "@/components/IssueView";
import { getViewer } from "@/lib/auth";
import { nflWeekNumber } from "@/lib/dates";
import { createServerClient } from "@/lib/supabase";
import { fetchAdjacentIssues } from "@/lib/issues";
import {
  fetchPlayerPositionLookup,
  serializePlayerLookup,
} from "@/lib/playerRegistry";
import { fetchUsageForWeek, usageByTeamAbbr } from "@/lib/playerUsage";
import { fetchTeamGames, type TeamGame } from "@/lib/teamGames";
import { entriesMentionedIn } from "@/lib/wrapPlayerNames";

type Props = {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ team?: string }>;
};

export const dynamic = "force-dynamic";

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) collectStrings(item, out);
  return out;
}

export default async function IssuePage({ params, searchParams }: Props) {
  const { date } = await params;
  const { team: teamParam } = await searchParams;
  const supabase = createServerClient();
  const lookupPromise = fetchPlayerPositionLookup(supabase);
  lookupPromise.catch(() => undefined);

  const [viewer, { data: issue }] = await Promise.all([
    getViewer(),
    supabase.from("newsletter_issues").select("*").eq("slug", date).maybeSingle(),
  ]);

  if (!issue || (issue.status !== "published" && !viewer?.isAdmin)) {
    return (
      <main>
        <h1>Issue not found</h1>
        <p>No newsletter for {date}.</p>
      </main>
    );
  }

  const favorite = teamParam ?? viewer?.favoriteTeamSlug ?? undefined;
  const issueDateIso = String(issue.issue_date).slice(0, 10);
  const weekNum =
    issue.issue_type === "weekly" ? nflWeekNumber(issueDateIso) : null;
  const gamesPromise = weekNum
    ? fetchTeamGames(2026, "REG").catch(() => null)
    : null;

  const [{ data: sections }, playerLookup, adjacent, usageRows] = await Promise.all([
    supabase
      .from("newsletter_sections")
      .select("*, newsletter_teams(slug, name, abbrev)")
      .eq("issue_id", issue.id)
      .order("sort_order"),
    lookupPromise,
    fetchAdjacentIssues(issue.issue_date, issue.issue_type as "daily" | "weekly", {
      includeDrafts: Boolean(viewer?.isAdmin),
    }),
    weekNum
      ? fetchUsageForWeek({ season: 2026, seasonType: "REG", week: weekNum }).catch(
          () => null
        )
      : null,
  ]);

  const playerEntries = entriesMentionedIn(
    serializePlayerLookup(playerLookup),
    collectStrings([issue.title, issue.league_section, sections]).join("\n")
  );
  const usageByTeam = usageRows ? usageByTeamAbbr(usageRows) : undefined;
  const usageWeekLabel = usageRows && weekNum ? `Week ${weekNum}` : undefined;
  const games = await gamesPromise;
  const usageMatchups: Record<string, TeamGame> = {};
  if (games && weekNum) {
    for (const [team, list] of Object.entries(games)) {
      const game = list.find((g) => g.week === weekNum);
      if (game) usageMatchups[team] = game;
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
      usageMatchups={usageMatchups}
      isAdmin={Boolean(viewer?.isAdmin)}
    />
  );
}
