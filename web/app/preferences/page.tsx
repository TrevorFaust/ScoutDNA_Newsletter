import Link from "next/link";
import teamsData from "../../../data/teams.json";

export default function PreferencesPage() {
  return (
    <main>
      <h1>Preferences</h1>
      <p>
        Account-based preferences (favorite team, frequency) will tie to auth in a later phase.
        For now, use <Link href="/signup">signup</Link> or add{" "}
        <code>?team=buffalo-bills</code> to any issue URL.
      </p>
      <h2>Teams</h2>
      <ul>
        {(teamsData as { slug: string; name: string }[]).map((t) => (
          <li key={t.slug}>
            <Link href={`/team/${t.slug}`}>{t.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
