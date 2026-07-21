import Link from "next/link";
import { getDivisionGroups } from "@/lib/teams";

export function TeamGrid() {
  const divisions = getDivisionGroups();

  return (
    <div className="team-browse">
      {Object.entries(divisions).map(([division, teams]) => (
        <section key={division} className="division-block">
          <h3 className="division-heading">{division}</h3>
          <ul className="team-list">
            {teams.map((team) => (
              <li key={team.slug}>
                <Link href={`/team/${team.slug}`} className="team-link">
                  <span className="team-abbrev">{team.abbrev.toUpperCase()}</span>
                  <span className="team-name">{team.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
