-- One row per team per nflverse game week: opponent, score, yards allowed, turnovers.
-- Populated by pipeline/src/sync_team_games.py during the daily nflverse sync.

CREATE TABLE IF NOT EXISTS team_week_results (
  season smallint NOT NULL,
  season_type text NOT NULL CHECK (season_type IN ('PRE', 'REG', 'POST')),
  week smallint NOT NULL,
  team_abbr text NOT NULL,
  opponent_abbr text NOT NULL,
  gameday date,
  home boolean,
  points_for smallint,
  points_against smallint,
  result text CHECK (result IN ('W', 'L', 'T')),
  yards_allowed integer,
  passing_yards_allowed integer,
  rushing_yards_allowed integer,
  turnovers_forced smallint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, season_type, week, team_abbr)
);

CREATE INDEX IF NOT EXISTS idx_team_week_results_team
  ON team_week_results (season, season_type, team_abbr, week);

ALTER TABLE team_week_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_week_results read" ON team_week_results;
CREATE POLICY "team_week_results read" ON team_week_results
  FOR SELECT TO anon, authenticated USING (true);
