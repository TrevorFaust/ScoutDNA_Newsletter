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

/** ESPN logo file codes. Washington is wsh, not was. */
export function espnLogoAbbr(abbrev: string): string {
  const key = abbrev.toLowerCase();
  if (key === "was" || key === "wsh") return "wsh";
  return key;
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

export type ConferenceBlock = {
  conference: "AFC" | "NFC";
  divisions: { name: string; teams: TeamRow[] }[];
};

export function getConferenceBlocks(): ConferenceBlock[] {
  const grouped = getDivisionGroups();
  const divisions = ["East", "North", "South", "West"] as const;
  return (["AFC", "NFC"] as const).map((conference) => ({
    conference,
    divisions: divisions.map((division) => ({
      name: division,
      teams: grouped[`${conference} ${division}`] ?? [],
    })),
  }));
}
