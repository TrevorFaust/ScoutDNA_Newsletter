import { getPositionBadgeClass } from "@/lib/positions";

type Props = {
  name: string;
  position: string;
};

export function PlayerNameChip({ name, position }: Props) {
  const cls = getPositionBadgeClass(position);
  return (
    <span className={`position-badge position-name-chip ${cls}`}>{name}</span>
  );
}
