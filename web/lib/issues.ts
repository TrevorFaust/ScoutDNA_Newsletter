import { createServerClient } from "@/lib/supabase";
import { formatIssueDate } from "@/lib/dates";

export type IssueSummary = {
  issue_date: string;
  slug: string;
  title: string;
  status: string;
  issue_type: "daily" | "weekly";
  published_at: string | null;
};

export async function fetchIssues(issueType?: "daily" | "weekly") {
  const supabase = createServerClient();
  let query = supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title, status, issue_type, published_at")
    .order("issue_date", { ascending: false });

  if (issueType) {
    query = query.eq("issue_type", issueType);
  }

  const { data, error } = await query;
  return { issues: (data ?? []) as IssueSummary[], error };
}

export async function fetchLatestIssue(issueType?: "daily" | "weekly", publishedOnly = false) {
  const supabase = createServerClient();
  let query = supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title, status, issue_type, published_at")
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

/** Remove em dashes from titles and descriptions shown on the site. */
export function cleanCopy(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/,\s*,/g, ",");
}

export async function fetchAdjacentIssues(
  issueDate: string,
  issueType: "daily" | "weekly"
): Promise<{ prev: AdjacentIssue | null; next: AdjacentIssue | null }> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title")
    .eq("issue_type", issueType)
    .order("issue_date", { ascending: true });

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
