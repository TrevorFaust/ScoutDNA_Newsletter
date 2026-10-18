import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/auth";
import { openingIsStatLine } from "@/lib/tagline";

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const form = await req.formData();
  const issueId = form.get("issueId") as string;
  const slug = form.get("slug") as string;

  if (!issueId || !slug) {
    return NextResponse.json({ error: "issueId and slug required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, key);

  const issue = await supabase
    .from("newsletter_issues")
    .select("issue_type")
    .eq("id", issueId)
    .maybeSingle();
  if (issue.error) {
    return NextResponse.json({ error: issue.error.message }, { status: 500 });
  }

  if (issue.data?.issue_type === "weekly") {
    const sections = await supabase
      .from("newsletter_sections")
      .select("intro_paragraphs, team_id")
      .eq("issue_id", issueId);
    if (sections.error) {
      return NextResponse.json({ error: sections.error.message }, { status: 500 });
    }
    const teams = await supabase.from("newsletter_teams").select("id, abbrev");
    if (teams.error) {
      return NextResponse.json({ error: teams.error.message }, { status: 500 });
    }
    const abbrev = new Map((teams.data ?? []).map((team) => [team.id, team.abbrev]));
    const statOpeners = (sections.data ?? [])
      .filter((row) => openingIsStatLine(row.intro_paragraphs ?? ""))
      .map((row) => abbrev.get(row.team_id) ?? "team");
    if (statOpeners.length > 0) {
      return NextResponse.json(
        {
          error: `Opener is a stat line for ${statOpeners.join(", ")}. Sentence 1 has to be the game or the week before this edition can post.`,
        },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from("newsletter_issues")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", issueId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL(`/issue/${slug}`, req.url), 303);
}
