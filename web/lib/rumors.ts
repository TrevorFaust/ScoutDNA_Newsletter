import { createServerClient } from "@/lib/supabase";
import type { IssueSummary } from "@/lib/issues";

export type IssueWithRumorCount = IssueSummary & {
  pending_rumors: number;
};

const REVIEWABLE_STATUSES = ["in_review", "draft", "approved"] as const;

/** Editions that can still be reviewed, with pending `review:rumor` counts. */
export async function fetchIssuesWithRumorCounts(): Promise<{
  issues: IssueWithRumorCount[];
  error: Error | null;
}> {
  const supabase = createServerClient();

  const { data: issueRows, error: issueError } = await supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title, status, issue_type, published_at, id")
    .in("status", [...REVIEWABLE_STATUSES])
    .order("issue_date", { ascending: false });

  if (issueError) {
    return { issues: [], error: new Error(issueError.message) };
  }

  const issues = issueRows ?? [];
  if (issues.length === 0) {
    return { issues: [], error: null };
  }

  const issueIds = issues.map((i) => i.id as string);

  // jsonb array containment (cs). .contains() does not match string[] jsonb reliably.
  const { data: sectionRows, error: sectionError } = await supabase
    .from("newsletter_sections")
    .select("issue_id")
    .filter("flags", "cs", '["review:rumor"]')
    .in("issue_id", issueIds);

  if (sectionError) {
    return { issues: [], error: new Error(sectionError.message) };
  }

  const counts = new Map<string, number>();
  for (const row of sectionRows ?? []) {
    const id = row.issue_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const withCounts: IssueWithRumorCount[] = issues.map((issue) => ({
    issue_date: issue.issue_date as string,
    slug: issue.slug as string,
    title: issue.title as string,
    status: issue.status as string,
    issue_type: issue.issue_type as "daily" | "weekly",
    published_at: (issue.published_at as string | null) ?? null,
    pending_rumors: counts.get(issue.id as string) ?? 0,
  }));

  // Pending work first, then newest.
  withCounts.sort((a, b) => {
    if (b.pending_rumors !== a.pending_rumors) {
      return b.pending_rumors - a.pending_rumors;
    }
    return b.issue_date.localeCompare(a.issue_date);
  });

  return { issues: withCounts, error: null };
}

const DRAFTABLE_STATUSES = [
  "in_review",
  "draft",
  "approved",
  "published",
] as const;

/** Editions eligible for Substack/Reddit drafts (includes published). */
export async function fetchIssuesForExternalDrafts(): Promise<{
  issues: IssueWithRumorCount[];
  error: Error | null;
}> {
  const supabase = createServerClient();

  const { data: issueRows, error: issueError } = await supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title, status, issue_type, published_at, id")
    .in("status", [...DRAFTABLE_STATUSES])
    .order("issue_date", { ascending: false })
    .limit(40);

  if (issueError) {
    return { issues: [], error: new Error(issueError.message) };
  }

  const issues = issueRows ?? [];
  if (issues.length === 0) {
    return { issues: [], error: null };
  }

  const issueIds = issues.map((i) => i.id as string);

  const { data: sectionRows, error: sectionError } = await supabase
    .from("newsletter_sections")
    .select("issue_id")
    .filter("flags", "cs", '["review:rumor"]')
    .in("issue_id", issueIds);

  if (sectionError) {
    return { issues: [], error: new Error(sectionError.message) };
  }

  const counts = new Map<string, number>();
  for (const row of sectionRows ?? []) {
    const id = row.issue_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const withCounts: IssueWithRumorCount[] = issues.map((issue) => ({
    issue_date: issue.issue_date as string,
    slug: issue.slug as string,
    title: issue.title as string,
    status: issue.status as string,
    issue_type: issue.issue_type as "daily" | "weekly",
    published_at: (issue.published_at as string | null) ?? null,
    pending_rumors: counts.get(issue.id as string) ?? 0,
  }));

  // Cleared first, then newest.
  withCounts.sort((a, b) => {
    const aReady = a.pending_rumors === 0 ? 1 : 0;
    const bReady = b.pending_rumors === 0 ? 1 : 0;
    if (bReady !== aReady) return bReady - aReady;
    return b.issue_date.localeCompare(a.issue_date);
  });

  return { issues: withCounts, error: null };
}
