import { espnLogoAbbr } from "@/lib/teams";

type Props = {
  abbrev: string;
  size?: number;
};

export function TeamLogo({ abbrev, size = 24 }: Props) {
  const code = espnLogoAbbr(abbrev);
  return (
    <img
      className="team-logo"
      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  );
}
