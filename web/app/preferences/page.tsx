import Link from "next/link";
import { saveEmailPreferences } from "@/app/actions/account";
import { AccountTeamSwap } from "@/components/AccountTeamSwap";
import { getViewer } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getTeams } from "@/lib/teams";

export const metadata = {
  title: "Account | ScoutDNA: All 32",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  const favorite = viewer
    ? getTeams().find((t) => t.slug === viewer.favoriteTeamSlug)
    : null;

  if (!viewer) {
    return (
      <main>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Account</span>
        </nav>
        <header className="page-header">
          <h1>Account</h1>
          <p className="page-lead">
            Sign in to set a favorite team, manage weekly recap emails, and
            keep your profile in one place.
          </p>
        </header>
        <p>
          <Link href="/signin?next=/preferences" className="btn btn-primary">
            Sign in
          </Link>
        </p>
      </main>
    );
  }

  const sb = createServerClient();
  const [emailPrefs, profile] = await Promise.all([
    sb
      .from("newsletter_subscribers")
      .select("frequency, unsubscribed_at")
      .eq("email", viewer.email)
      .maybeSingle()
      .then(({ data }) => ({
        subscribed: Boolean(data && !data.unsubscribed_at),
        frequency: data?.frequency ?? "weekly",
      })),
    sb
      .from("newsletter_profiles")
      .select("created_at, role")
      .eq("id", viewer.id)
      .maybeSingle()
      .then((result) => result.data),
  ]);

  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Account</span>
      </nav>

      <header className="page-header">
        <h1>Account</h1>
        <p className="page-lead">
          Email preferences, your favorite team, and the rest of your ScoutDNA
          profile.
        </p>
      </header>

      {params.saved === "email" ? (
        <p className="account-saved" role="status">
          Email preferences saved.
        </p>
      ) : null}

      <div className="account-stack">
        <section className="account-card">
          <h2>Profile</h2>
          <dl className="account-dl">
            <dt>Email</dt>
            <dd>{viewer.email}</dd>
            {viewer.isAdmin ? (
              <>
                <dt>Role</dt>
                <dd>Writer</dd>
              </>
            ) : null}
            {joined ? (
              <>
                <dt>Member since</dt>
                <dd>{joined}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section className="account-card">
          <h2>Favorite team</h2>
          <p className="account-card-lead">
            Recaps open on this section. Swap anytime — it only changes where
            you land, not the rest of the issue.
          </p>
          <AccountTeamSwap
            selected={viewer.favoriteTeamSlug}
            teamName={favorite?.name ?? null}
            teamAbbrev={favorite?.abbrev ?? null}
          />
        </section>

        <section className="account-card">
          <h2>Email preferences</h2>
          <p className="account-card-lead">
            The weekly recap goes out after Sunday. It follows your favorite
            team when you have one.
          </p>
          <form action={saveEmailPreferences} className="account-email-form">
            <fieldset className="account-choice">
              <legend className="sr-only">Weekly recap emails</legend>
              <label>
                <input
                  type="radio"
                  name="frequency"
                  value="weekly"
                  defaultChecked={emailPrefs.subscribed}
                />
                <span>
                  <strong>Send the weekly recap</strong>
                  <span>Tuesday letter, league plus your club.</span>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="frequency"
                  value="off"
                  defaultChecked={!emailPrefs.subscribed}
                />
                <span>
                  <strong>Don’t email me</strong>
                  <span>You can still read everything on the site.</span>
                </span>
              </label>
            </fieldset>
            <button type="submit" className="btn btn-primary">
              Save email preferences
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
