import { ConferenceMark } from "@/components/ConferenceMark";
import { TeamLogo } from "@/components/TeamLogo";
import { getConferenceBlocks } from "@/lib/teams";

function nickname(name: string) {
  return name.split(/\s+/).at(-1) ?? name;
}

export function TeamJumpNav() {
  const conferences = getConferenceBlocks();

  return (
    <nav className="team-jump" aria-label="Jump to team">
      <h2 className="team-jump-title">Jump to team</h2>
      <div className="team-jump-conferences">
        {conferences.map(({ conference, divisions }) => (
          <div key={conference} className="team-jump-conference">
            <div className="team-jump-mark">
              <ConferenceMark conference={conference} />
            </div>
            <div className="team-jump-divisions">
              {divisions.map(({ name, teams }) => (
                <section key={name} className="team-jump-division">
                  <h3 className="team-jump-division-name">{name}</h3>
                  <ul className="team-jump-list">
                    {teams.map((team) => (
                      <li key={team.slug}>
                        <a
                          href={`#${team.slug}`}
                          className="team-jump-link"
                          title={team.name}
                          aria-label={team.name}
                        >
                          <TeamLogo abbrev={team.abbrev} size={18} />
                          <span className="team-jump-abbrev">
                            {team.abbrev.toUpperCase()}
                          </span>
                          <span className="team-jump-name">{nickname(team.name)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
