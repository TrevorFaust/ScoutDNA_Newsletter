import teamsData from "../../data/teams.json";

export type TeamRow = {
  slug: string;
  abbrev: string;
  name: string;
  conference: string;
  division: string;
  division_order: number;
};

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
