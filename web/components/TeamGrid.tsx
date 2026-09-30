import Link from "next/link";
import { ConferenceMark } from "@/components/ConferenceMark";
import { TeamLogo } from "@/components/TeamLogo";
import { getConferenceBlocks } from "@/lib/teams";

export function TeamGrid() {
  const conferences = getConferenceBlocks();

  return (
    <div className="team-browse-conferences">
      {conferences.map(({ conference, divisions }) => (
        <div key={conference} className="team-conference">
          <h2 className="team-conference-mark">
            <ConferenceMark conference={conference} />
          </h2>
          {divisions.map(({ name, teams }) => (
            <section key={name} className="division-block">
              <h3 className="division-heading">
                {conference} {name}
              </h3>
              <ul className="team-list">
                {teams.map((team) => (
                  <li key={team.slug}>
                    <Link href={`/team/${team.slug}`} className="team-link">
                      <TeamLogo abbrev={team.abbrev} size={28} />
                      <span className="team-abbrev">{team.abbrev.toUpperCase()}</span>
                      <span className="team-name">{team.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
