import { TeamLogo } from "@/components/TeamLogo";
import { getTeams } from "@/lib/teams";
import type { TeamGame } from "@/lib/teamGames";

const TEAM_NAMES = new Map(getTeams().map((t) => [t.abbrev.toUpperCase(), t.name]));

function teamName(abbrev: string) {
  return TEAM_NAMES.get(abbrev) ?? abbrev;
}

function venue(game: TeamGame) {
  return game.home === false ? "@" : "vs.";
}

function score(game: TeamGame) {
  if (!game.result || game.pointsFor == null || game.pointsAgainst == null) return null;
  return `${game.result} ${game.pointsFor}-${game.pointsAgainst}`;
}

function resultClass(game: TeamGame) {
  if (game.result === "W") return "matchup-result matchup-result-w";
  if (game.result === "L") return "matchup-result matchup-result-l";
  return "matchup-result";
}

/** One game: "vs. [logo] Carolina Panthers  W 26-13". */
export function MatchupTag({ game }: { game: TeamGame }) {
  const final = score(game);
  return (
    <span className="matchup-tag">
      <span className="matchup-venue">{venue(game)}</span>
      <TeamLogo abbrev={game.opponent} size={16} />
      <span className="matchup-opponent">{teamName(game.opponent)}</span>
      {final ? <span className={resultClass(game)}>{final}</span> : null}
    </span>
  );
}

/** Season slice: "W1 vs. [logo] CAR · W2 @ [logo] MIN · ...". */
export function MatchupStrip({ games }: { games: TeamGame[] }) {
  return (
    <ul className="matchup-strip" aria-label="Opponents by week">
      {games.map((game) => {
        const final = score(game);
        const label = `Week ${game.week} ${venue(game)} ${teamName(game.opponent)}${
          final ? `, ${final}` : ""
        }`;
        return (
          <li key={game.week} className="matchup-strip-item" title={label} aria-label={label}>
            <span className="matchup-week">W{game.week}</span>
            <span className="matchup-venue">{venue(game)}</span>
            <TeamLogo abbrev={game.opponent} size={16} />
            <span className="matchup-opponent-abbrev">{game.opponent}</span>
            {game.result ? (
              <span className={resultClass(game)}>{game.result}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
