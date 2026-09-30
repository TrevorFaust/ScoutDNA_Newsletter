"use client";

import { useState } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamPicker } from "@/components/TeamPicker";

type Props = {
  selected?: string | null;
  teamName?: string | null;
  teamAbbrev?: string | null;
};

export function AccountTeamSwap({ selected, teamName, teamAbbrev }: Props) {
  const [open, setOpen] = useState(!selected);

  return (
    <div className="account-team-swap">
      <div className="account-favorite">
        {teamAbbrev ? <TeamLogo abbrev={teamAbbrev} size={40} /> : null}
        <div className="account-favorite-copy">
          <p className="account-favorite-name">
            {teamName ?? "No favorite team yet"}
          </p>
          <p className="account-favorite-hint">
            {teamName
              ? "Weekly recaps open on this club."
              : "Pick a club so recaps jump to your section."}
          </p>
        </div>
        {selected ? (
          <button
            type="button"
            className="btn btn-paper"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? "Close list" : "Change team"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="account-team-picker">
          <p className="account-picker-label">
            {selected ? "Choose a different club" : "Choose your club"}
          </p>
          <TeamPicker selected={selected} next="/preferences" />
        </div>
      ) : null}
    </div>
  );
}
