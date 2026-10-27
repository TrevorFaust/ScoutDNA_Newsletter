import { ConferenceMark } from "@/components/ConferenceMark";
import { TeamLogo } from "@/components/TeamLogo";
import {
  compareStandings,
  formatRecord,
  type TeamRecord,
} from "@/lib/teamGames";
import { getConferenceBlocks } from "@/lib/teams";

function nickname(name: string) {
  return name.split(/\s+/).at(-1) ?? name;
}

export function TeamJumpNav({
  records,
}: {
  records?: Record<string, TeamRecord>;
}) {
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
              {divisions.map(({ name, teams }) => {
                const ordered = records
                  ? [...teams].sort((a, b) => {
                      const recA = records[a.abbrev.toUpperCase()];
                      const recB = records[b.abbrev.toUpperCase()];
                      if (recA && recB) {
                        const byStanding = compareStandings(recA, recB);
                        if (byStanding !== 0) return byStanding;
                      }
                      return a.division_order - b.division_order;
                    })
                  : teams;
                return (
                  <section key={name} className="team-jump-division">
                    <h3 className="team-jump-division-name">{name}</h3>
                    <ul className="team-jump-list">
                      {ordered.map((team) => {
                        const rec = records?.[team.abbrev.toUpperCase()];
                        const recordLabel = rec ? formatRecord(rec) : null;
                        const label = recordLabel
                          ? `${team.name} ${recordLabel}`
                          : team.name;
                        return (
                          <li key={team.slug}>
                            <a
                              href={`#${team.slug}`}
                              className="team-jump-link"
                              title={label}
                              aria-label={label}
                            >
                              <TeamLogo abbrev={team.abbrev} size={18} />
                              <span className="team-jump-abbrev">
                                {team.abbrev.toUpperCase()}
                              </span>
                              <span className="team-jump-name">
                                {nickname(team.name)}
                              </span>
                              {recordLabel ? (
                                <span className="team-jump-record">
                                  {recordLabel}
                                </span>
                              ) : null}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
