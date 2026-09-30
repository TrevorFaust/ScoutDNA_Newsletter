"use client";

import { useState } from "react";
import { saveFavoriteTeam } from "@/app/actions/account";
import { ConferenceMark } from "@/components/ConferenceMark";
import { TeamLogo } from "@/components/TeamLogo";
import { getConferenceBlocks } from "@/lib/teams";

type Props = {
  selected?: string | null;
  next?: string;
};

export function TeamPicker({ selected, next }: Props) {
  const conferences = getConferenceBlocks();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function pick(slug: string) {
    setPending(slug);
    setError("");
    const result = await saveFavoriteTeam(slug, next || "/");
    if (result?.error) {
      setError(result.error);
      setPending(null);
    }
  }

  return (
    <>
      {error ? <p className="alert">{error}</p> : null}
      <div className="team-browse-conferences">
        {conferences.map(({ conference, divisions }) => (
        <div key={conference} className="team-conference">
          <h2 className="team-conference-mark">
            <ConferenceMark conference={conference} />
          </h2>
          {divisions.map(({ name, teams }) => (
            <section key={`${conference}-${name}`} className="division-block">
              <h3 className="division-heading">
                {conference} {name}
              </h3>
              <ul className="team-list">
                {teams.map((team) => {
                  const isSelected = selected === team.slug;
                  const isPending = pending === team.slug;
                  return (
                    <li key={team.slug}>
                      <button
                        type="button"
                        className={
                          isSelected ? "team-link team-link-selected" : "team-link"
                        }
                        onClick={() => pick(team.slug)}
                        disabled={pending !== null}
                        aria-pressed={isSelected}
                      >
                        <TeamLogo abbrev={team.abbrev} size={28} />
                        <span className="team-abbrev">{team.abbrev.toUpperCase()}</span>
                        <span className="team-name">
                          {isPending ? "Saving…" : team.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ))}
      </div>
    </>
  );
}
