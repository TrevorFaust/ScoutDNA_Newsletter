-- Current NFL injury board (ESPN injuries API; optional NFL.com official later).
-- Populated by pipeline/src/sync_espn_injuries.py.

CREATE TABLE IF NOT EXISTS player_injury_status (
  season smallint NOT NULL,
  espn_athlete_id text NOT NULL,
  team_abbr text NOT NULL,
  player_name text NOT NULL,
  position text,
  status text NOT NULL,
  fantasy_status text,
  injury_type text,
  injury_detail text,
  return_date date,
  short_comment text,
  long_comment text,
  source text NOT NULL DEFAULT 'espn',
  nfl_week smallint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, espn_athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_player_injury_status_team
  ON player_injury_status (season, team_abbr);

CREATE INDEX IF NOT EXISTS idx_player_injury_status_name
  ON player_injury_status (player_name);

ALTER TABLE player_injury_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_injury_status read" ON player_injury_status;
CREATE POLICY "player_injury_status read" ON player_injury_status
  FOR SELECT TO anon, authenticated USING (true);
