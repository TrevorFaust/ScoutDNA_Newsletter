-- Curated skill-position battles per team (QB/RB/WR/TE). You maintain the CSV; sync script upserts here.
-- status: settled = role largely defined; contested = named candidates competing; open = alpha/slot truly unclear.

CREATE TABLE IF NOT EXISTS fantasy_position_battles (
  season smallint NOT NULL DEFAULT 2026,
  team_abbr text NOT NULL,
  position text NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE')),
  slot text NOT NULL,
  status text NOT NULL CHECK (status IN ('settled', 'contested', 'open')),
  candidates text[] NOT NULL DEFAULT '{}',
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, team_abbr, position, slot)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_position_battles_team
  ON fantasy_position_battles (team_abbr);

ALTER TABLE fantasy_position_battles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fantasy_position_battles read" ON fantasy_position_battles;
CREATE POLICY "fantasy_position_battles read"
ON fantasy_position_battles
FOR SELECT
USING (true);
