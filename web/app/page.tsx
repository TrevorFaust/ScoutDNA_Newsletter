import Link from "next/link";
import { HomeFeatureCards } from "@/components/HomeFeatureCards";
import { IssueCard } from "@/components/IssueCard";
import { getViewer, issueTeamHref } from "@/lib/auth";
import { fetchIssues, fetchLatestIssue } from "@/lib/issues";
import { displayIssueTitle, issueDeck, issueHook } from "@/lib/issueTitle";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  const includeDrafts = Boolean(viewer?.isAdmin);
  const teamSlug = viewer?.favoriteTeamSlug ?? undefined;

  const [{ issues: allIssues, error }, latestWeekly] = await Promise.all([
    fetchIssues("weekly", { includeDrafts }),
    fetchLatestIssue("weekly", !includeDrafts),
  ]);

  const recent = allIssues
    .filter((issue) => issue.slug !== latestWeekly?.slug)
    .slice(0, 3);
  const latestTitle = latestWeekly ? displayIssueTitle(latestWeekly) : undefined;
  const latestHook = latestWeekly ? issueHook(latestWeekly) : null;
  const latestDeck = latestWeekly ? issueDeck(latestWeekly) : null;
  const latestHref = latestWeekly
    ? issueTeamHref(latestWeekly.slug, teamSlug)
    : undefined;

  return (
    <main>
      {params.denied === "1" ? (
        <p className="alert">
          Review, rumors, camp signals, and draft upload are editor-only.
        </p>
      ) : null}

      <section className="hero">
        <p className="hero-eyebrow">All 32</p>
        <h1 className="hero-title">
          News for <em>every</em> team
        </h1>
        <p className="hero-lead">
          Your club had a week, so did the other 31. Don&apos;t miss a snap.
        </p>
        <div className="hero-actions">
          {latestWeekly && latestHref && (
            <Link href={latestHref} className="btn btn-paper">
              Read {latestTitle}
            </Link>
          )}
          <Link href="/teams" className="btn btn-paper">
            Browse by team
          </Link>
        </div>
      </section>

      {error && (
        <p className="alert">
          Database error: {error.message}. Add SUPABASE_SERVICE_ROLE_KEY to web/.env.local
          and restart npm run dev.
        </p>
      )}

      <HomeFeatureCards
        latestHref={latestHref}
        latestLabel={latestTitle}
      />

      {latestWeekly && latestHref && (
        <section className="featured-recap">
          <div className="featured-recap-copy">
            <span className="edition-badge edition-weekly">Latest recap</span>
            <h2>{latestTitle}</h2>
            {latestHook ? <p className="featured-recap-hook">{latestHook}</p> : null}
            <p>
              {latestDeck ||
                "Boxes, what moved, and the reporting, team by team."}
            </p>
            <Link href={latestHref} className="btn btn-paper">
              Open this week
            </Link>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="page-section page-section-center home-recent">
          <div className="section-header">
            <h2>Recent recaps</h2>
            <Link href="/weekly" className="section-link">
              View all
            </Link>
          </div>
          <div className="issue-grid issue-grid-compact">
            {recent.map((issue) => (
              <IssueCard
                key={`${issue.slug}-${issue.issue_type}`}
                issue={issue}
                teamSlug={teamSlug}
                isAdmin={includeDrafts}
              />
            ))}
          </div>
        </section>
      )}

      {!error && allIssues.length === 0 && (
        <p className="empty-state">
          {includeDrafts
            ? "No recaps yet. Run collect, then compose (see README). Drafts appear here before publish."
            : "No published recaps yet."}
        </p>
      )}

      <footer className="site-footer">
        <Link href="/preferences">Account</Link>
      </footer>
    </main>
  );
}
