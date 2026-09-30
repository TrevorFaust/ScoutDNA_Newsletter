"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";

type Option = { value: string; label: string };

type Props = {
  season: string;
  seasonOptions: Option[];
  seasonType: string;
  seasonTypeOptions: Option[];
  week: string;
  weekOptions: Option[];
  team: string;
  teamOptions: Option[];
  scoring: string;
  scoringOptions: Option[];
};

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Option[];
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function UsageFilters(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value !== "") query.set(key, value);
    }
    startTransition(() => {
      router.push(`${pathname}?${query}`, { scroll: false });
    });
  }

  return (
    <form
      key={[props.season, props.seasonType, props.week, props.team, props.scoring].join("|")}
      className="usage-filters"
      onSubmit={onSubmit}
      aria-busy={pending}
    >
      <FilterSelect label="Season" name="season" value={props.season} options={props.seasonOptions} />
      <FilterSelect
        label="Type"
        name="season_type"
        value={props.seasonType}
        options={props.seasonTypeOptions}
      />
      <FilterSelect label="Week" name="week" value={props.week} options={props.weekOptions} />
      <FilterSelect label="Team" name="team" value={props.team} options={props.teamOptions} />
      <FilterSelect
        label="Scoring"
        name="scoring"
        value={props.scoring}
        options={props.scoringOptions}
      />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Applying…" : "Apply"}
      </button>
    </form>
  );
}
