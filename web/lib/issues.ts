import { formatIssueDate, weekTabLabel } from "@/lib/dates";
import { displayIssueTitle, issueDeck, issueHook } from "@/lib/issueTitle";
import { createServerClient } from "@/lib/supabase";
import { getTeams } from "@/lib/teams";
import type { WeeklyReelItem } from "@/lib/weeklyReel";

export { cleanCopy } from "@/lib/cleanCopy";

export type IssueSummary = {
  issue_date: string;
  slug: string;
  title: string;
  status: string;
  issue_type: "daily" | "weekly";
  published_at: string | null;
  hook?: string | null;
  deck?: string | null;
};

export async function fetchIssues(
  issueType?: "daily" | "weekly",
  opts?: { includeDrafts?: boolean }
) {
  const supabase = createServerClient();
  let query = supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title, status, issue_type, published_at, hook, deck")
    .order("issue_date", { ascending: false });

  if (issueType) {
    query = query.eq("issue_type", issueType);
  }
  if (!opts?.includeDrafts) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;
  return { issues: (data ?? []) as IssueSummary[], error };
}

export async function fetchLatestIssue(issueType?: "daily" | "weekly", publishedOnly = false) {
  const supabase = createServerClient();
  let query = supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title, status, issue_type, published_at, hook, deck")
    .order("issue_date", { ascending: false })
    .limit(1);

  if (issueType) {
    query = query.eq("issue_type", issueType);
  }
  if (publishedOnly) {
    query = query.eq("status", "published");
  }

  const { data } = await query;
  return (data?.[0] as IssueSummary | undefined) ?? null;
}

export { formatIssueDate } from "@/lib/dates";

export function statusLabel(status: string) {
  switch (status) {
    case "published":
      return "Published";
    case "in_review":
      return "In review";
    case "collected":
      return "Awaiting compose";
    case "collecting":
      return "Collecting";
    default:
      return status;
  }
}

export type AdjacentIssue = {
  slug: string;
  title: string;
  issue_date: string;
};

export async function fetchAdjacentIssues(
  issueDate: string,
  issueType: "daily" | "weekly",
  opts?: { includeDrafts?: boolean }
): Promise<{ prev: AdjacentIssue | null; next: AdjacentIssue | null }> {
  const supabase = createServerClient();
  let query = supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title")
    .eq("issue_type", issueType)
    .order("issue_date", { ascending: true });
  if (!opts?.includeDrafts) {
    query = query.eq("status", "published");
  }
  const { data } = await query;

  const issues = (data ?? []) as AdjacentIssue[];
  const idx = issues.findIndex((i) => i.issue_date === issueDate);

  if (idx < 0) {
    return { prev: null, next: null };
  }

  return {
    prev: idx > 0 ? issues[idx - 1] : null,
    next: idx < issues.length - 1 ? issues[idx + 1] : null,
  };
}

export type { WeeklyReelItem } from "@/lib/weeklyReel";

type WeeklyIssueRow = IssueSummary & {
  id: string;
  league_section: string | null;
};

function stripPreview(text: string | null | undefined, max = 320): string {
  if (!text) return "";
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${cut.slice(0, sp > 80 ? sp : max).trim()}…`;
}

export async function fetchWeeklyReel(opts: {
  teamSlug?: string;
  includeDrafts?: boolean;
}): Promise<{
  items: WeeklyReelItem[];
  previewLabel: string;
  error: { message: string } | null;
}> {
  const supabase = createServerClient();
  let query = supabase
    .from("newsletter_issues")
    .select("id, issue_date, slug, title, status, issue_type, published_at, hook, deck, league_section")
    .eq("issue_type", "weekly")
    .order("issue_date", { ascending: false });
  if (!opts.includeDrafts) {
    query = query.eq("status", "published");
  }
  const team = opts.teamSlug
    ? getTeams().find((t) => t.slug === opts.teamSlug)
    : undefined;
  const [{ data, error }, teamRow] = await Promise.all([
    query,
    team
      ? supabase
          .from("newsletter_teams")
          .select("id")
          .eq("slug", team.slug)
          .maybeSingle()
          .then(({ data: row }) => row)
      : null,
  ]);
  const issues = (data ?? []) as WeeklyIssueRow[];
  const previewByIssue = new Map<string, string>();

  if (team && issues.length > 0) {
    if (teamRow?.id) {
      const { data: sections } = await supabase
        .from("newsletter_sections")
        .select("issue_id, intro_paragraphs")
        .eq("team_id", teamRow.id)
        .in(
          "issue_id",
          issues.map((issue) => issue.id)
        );
      for (const row of sections ?? []) {
        const preview = stripPreview(row.intro_paragraphs as string | null);
        if (preview) previewByIssue.set(row.issue_id as string, preview);
      }
    }
  }

  const items = issues.map((issue) => {
    const hook = issueHook(issue);
    const deck = issueDeck(issue);
    const preview =
      previewByIssue.get(issue.id) ||
      stripPreview(issue.league_section) ||
      deck ||
      hook ||
      "";
    return {
      slug: issue.slug,
      issueDate: issue.issue_date,
      href: opts.teamSlug
        ? `/issue/${issue.slug}?team=${opts.teamSlug}`
        : `/issue/${issue.slug}`,
      label: displayIssueTitle(issue),
      tabLabel: weekTabLabel(issue.issue_date),
      dateLabel: formatIssueDate(issue.issue_date),
      hook,
      deck,
      preview,
      status: issue.status,
    };
  });

  return {
    items,
    previewLabel: team ? team.name : "League letter",
    error: error ? { message: error.message } : null,
  };
}
