import { NextRequest, NextResponse } from "next/server";
import { fetchLatestIssue } from "@/lib/issues";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const team = searchParams.get("team");
  const type = searchParams.get("type");

  const issueType = type === "weekly" ? "weekly" : type === "daily" ? "daily" : undefined;
  const latest = await fetchLatestIssue(issueType, true);

  if (!latest) {
    const fallback = await fetchLatestIssue(issueType, false);
    if (!fallback) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    const url = new URL(`/issue/${fallback.slug}`, request.url);
    if (team) url.searchParams.set("team", team);
    return NextResponse.redirect(url);
  }

  const url = new URL(`/issue/${latest.slug}`, request.url);
  if (team) url.searchParams.set("team", team);
  return NextResponse.redirect(url);
}
