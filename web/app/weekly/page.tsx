import Link from "next/link";
import { EditionTicket } from "@/components/EditionTicket";
import { PageMasthead } from "@/components/PageMasthead";
import { WeeklyReel } from "@/components/WeeklyReel";
import { getViewer } from "@/lib/auth";
import { fetchWeeklyReel } from "@/lib/issues";

export const metadata = {
  title: "Week recaps | ScoutDNA: All 32",
  description: "Tuesday NFL week recaps for all 32 teams.",
};

export default async function WeeklyPage() {
  const viewer = await getViewer();
  const includeDrafts = Boolean(viewer?.isAdmin);
  const teamSlug = viewer?.favoriteTeamSlug ?? undefined;

  const { items, error } = await fetchWeeklyReel({
    teamSlug,
    includeDrafts,
  });
  const [latest, ...earlier] = items;

  return (
    <main className="weekly-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Weekly</span>
      </nav>

      <PageMasthead
        eyebrow="Tuesday edition"
        title="Week recaps"
      >
        <p className="masthead-lead">
          Monday night ends and by Tuesday morning, all 32 teams have their week
          on paper: the results, the injuries, who got the work, and what the
          reporting says comes next. Pull an older week and hold it up against
          this one. See who kept the job, which rumors turned into moves, and
          which ones went quiet.
        </p>
      </PageMasthead>

      {error && (
        <p className="alert">
          Database error: {error.message}. Add SUPABASE_SERVICE_ROLE_KEY to web/.env.local.
        </p>
      )}

      {latest ? (
        <>
          <section className="weekly-shelf" aria-labelledby="weekly-latest-label">
            <h2 id="weekly-latest-label" className="weekly-shelf-label">
              This week
            </h2>
            <article className="ticket-featured">
              <EditionTicket item={latest} isAdmin={includeDrafts} />
            </article>
          </section>

          {earlier.length > 0 ? (
            <section className="weekly-shelf" aria-labelledby="weekly-earlier-label">
              <h2 id="weekly-earlier-label" className="weekly-shelf-label">
                Earlier weeks
              </h2>
              <WeeklyReel items={earlier} isAdmin={includeDrafts} />
            </section>
          ) : null}
        </>
      ) : (
        <p className="empty-state">
          No weekly issues yet. Week recaps compose on Tuesdays after the 3am PT nflverse sync.
        </p>
      )}
    </main>
  );
}
