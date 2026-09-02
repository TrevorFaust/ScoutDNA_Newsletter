import teamsData from "../../data/teams.json";

export type TeamRow = {
  slug: string;
  abbrev: string;
  name: string;
  conference: string;
  division: string;
  division_order: number;
};

export function getTeams(): TeamRow[] {
  return teamsData as TeamRow[];
}

export type TeamNameLexicon = {
  /** Full franchise names, longest first (e.g. "Washington Commanders"). */
  fullNames: string[];
  /** Lowercased nicknames (commanders, cowboys, jets). */
  nicknames: Set<string>;
  /** Lowercased city phrases, longest first ("new york", "washington"). */
  cities: string[];
};

let teamNameLexicon: TeamNameLexicon | null = null;

/** Franchise tokens used to keep team names from being chipped as players. */
export function getTeamNameLexicon(): TeamNameLexicon {
  if (teamNameLexicon) return teamNameLexicon;
  const teams = getTeams();
  const fullNames = teams
    .map((t) => t.name)
    .sort((a, b) => b.length - a.length);
  const nicknames = new Set<string>();
  const citySet = new Set<string>();
  for (const t of teams) {
    const parts = t.name.split(/\s+/).filter(Boolean);
    const nick = parts[parts.length - 1];
    if (nick) nicknames.add(nick.toLowerCase());
    if (parts.length > 1) {
      citySet.add(parts.slice(0, -1).join(" ").toLowerCase());
    }
  }
  teamNameLexicon = {
    fullNames,
    nicknames,
    cities: [...citySet].sort((a, b) => b.length - a.length),
  };
  return teamNameLexicon;
}

export function getDivisionGroups(): Record<string, TeamRow[]> {
  const order = { East: 0, North: 1, South: 2, West: 3 };
  const teams = teamsData as TeamRow[];
  const grouped: Record<string, TeamRow[]> = {};
  for (const t of [...teams].sort(
    (a, b) =>
      a.conference.localeCompare(b.conference) ||
      order[a.division as keyof typeof order] -
        order[b.division as keyof typeof order] ||
      a.division_order - b.division_order
  )) {
    const key = `${t.conference} ${t.division}`;
    (grouped[key] ??= []).push(t);
  }
  return grouped;
}
