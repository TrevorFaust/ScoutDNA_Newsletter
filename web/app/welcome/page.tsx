import { redirect } from "next/navigation";
import { TeamPicker } from "@/components/TeamPicker";
import { getViewer } from "@/lib/auth";

export const metadata = {
  title: "Pick your team | ScoutDNA: All 32",
};

export default async function WelcomePage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/signin?next=/welcome");
  }

  return (
    <main>
      <header className="page-header">
        <p className="hero-eyebrow">First sign-in</p>
        <h1>Who do you watch on Sundays?</h1>
        <p className="page-lead">
          Pick your club. Weekly recaps will open on that section instead of
          making you scroll the league. You can change this later in
          Account.
        </p>
      </header>
      <TeamPicker selected={viewer.favoriteTeamSlug} next="/" />
    </main>
  );
}
