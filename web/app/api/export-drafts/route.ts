import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatIssueDate } from "@/lib/dates";
import { cleanCopy } from "@/lib/issues";
import {
  exportIssueMarkdown,
  exportTeamMarkdown,
  markdownToSubstackBody,
  redditDraftTitle,
  type ExportSection,
} from "@/lib/exportMarkdown";
import {
  createRedditTeamDrafts,
  redditDraftsConfigured,
} from "@/lib/redditDrafts";
import {
  createSubstackDraft,
  substackDraftsConfigured,
} from "@/lib/substackDrafts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  issueId: string;
  targets?: Array<"reddit" | "substack">;
};

function teamFromJoin(raw: unknown): ExportSection["teams"] {
  const team = raw as
    | {
        slug: string;
        name: string;
        abbrev?: string;
        reddit_subreddit?: string | null;
      }
    | {
        slug: string;
        name: string;
        abbrev?: string;
        reddit_subreddit?: string | null;
      }[]
    | null;
  const t = Array.isArray(team) ? team[0] : team;
  return (
    t ?? {
      slug: "",
      name: "Team",
      abbrev: "",
      reddit_subreddit: null,
    }
  );
}

export async function POST(req: NextRequest) {
  if (process.env.EXTERNAL_DRAFTS_ENABLED?.toLowerCase() !== "true") {
    return NextResponse.json(
      {
        error:
          "External drafts are disabled. Set EXTERNAL_DRAFTS_ENABLED=true after adding Reddit/Substack credentials.",
      },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.issueId) {
    return NextResponse.json({ error: "issueId required" }, { status: 400 });
  }

  const targets = new Set(body.targets ?? ["reddit", "substack"]);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, key);

  const { data: issue, error: issueErr } = await supabase
    .from("newsletter_issues")
    .select(
      "id, slug, title, issue_date, issue_type, status, league_section, league_footnotes"
    )
    .eq("id", body.issueId)
    .maybeSingle();

  if (issueErr || !issue) {
    return NextResponse.json(
      { error: issueErr?.message || "Issue not found" },
      { status: 404 }
    );
  }

  const { data: sectionRows, error: secErr } = await supabase
    .from("newsletter_sections")
    .select(
      `id, intro_paragraphs, rookie_paragraph, activity_markdown, talk_markdown,
       fantasy_markdown, footnotes, is_empty, sort_order, flags,
       newsletter_teams(slug, name, abbrev, reddit_subreddit)`
    )
    .eq("issue_id", issue.id)
    .order("sort_order");

  if (secErr) {
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }

  const pending = (sectionRows ?? []).filter((row) =>
    ((row.flags as string[]) ?? []).includes("review:rumor")
  ).length;

  if (pending > 0) {
    return NextResponse.json(
      {
        error: `Clear ${pending} pending rumor(s) before creating external drafts.`,
        pendingRumors: pending,
      },
      { status: 409 }
    );
  }

  const sections: ExportSection[] = (sectionRows ?? []).map((row) => ({
    intro_paragraphs: row.intro_paragraphs as string | null,
    rookie_paragraph: row.rookie_paragraph as string | null,
    activity_markdown: row.activity_markdown as string | null,
    talk_markdown: row.talk_markdown as string | null,
    fantasy_markdown: row.fantasy_markdown as string | null,
    footnotes: (row.footnotes as ExportSection["footnotes"]) ?? [],
    is_empty: Boolean(row.is_empty),
    teams: teamFromJoin(row.newsletter_teams),
  }));

  const dateLabel = formatIssueDate(issue.issue_date as string);
  const title = cleanCopy(issue.title as string);

  const teamPosts = sections.flatMap((section) => {
    const bodyMd = exportTeamMarkdown(section);
    if (!bodyMd) return [];
    return [
      {
        teamSlug: section.teams.slug,
        teamName: section.teams.name,
        subreddit: section.teams.reddit_subreddit,
        title: redditDraftTitle(section.teams.name, dateLabel),
        body: bodyMd,
      },
    ];
  });

  const result: {
    issueId: string;
    slug: string;
    teamPostsPrepared: number;
    reddit?: Awaited<ReturnType<typeof createRedditTeamDrafts>>;
    substack?: Awaited<ReturnType<typeof createSubstackDraft>>;
    warnings: string[];
  } = {
    issueId: issue.id as string,
    slug: issue.slug as string,
    teamPostsPrepared: teamPosts.length,
    warnings: [],
  };

  if (targets.has("reddit")) {
    if (!redditDraftsConfigured()) {
      result.warnings.push(
        "Reddit skipped: set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and either REDDIT_REFRESH_TOKEN or REDDIT_USERNAME + REDDIT_PASSWORD."
      );
    } else {
      result.reddit = await createRedditTeamDrafts(teamPosts);
    }
  }

  if (targets.has("substack")) {
    if (!substackDraftsConfigured()) {
      result.warnings.push(
        "Substack skipped: set SUBSTACK_CONNECT_SID from your browser cookie."
      );
    } else {
      const md = exportIssueMarkdown({
        title,
        leagueSection: issue.league_section as string | null,
        leagueFootnotes:
          (issue.league_footnotes as ExportSection["footnotes"]) ?? [],
        sections,
        includeTitle: false,
      });
      result.substack = await createSubstackDraft({
        title,
        subtitle: `${dateLabel} · ${issue.issue_type === "weekly" ? "Weekly" : "Daily"}`,
        body: markdownToSubstackBody(md),
      });
    }
  }

  return NextResponse.json(result);
}
