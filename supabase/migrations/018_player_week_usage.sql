-- Weekly skill-player usage from nflverse (box + snaps + computed shares).
-- Populated by pipeline/src/sync_player_usage.py.

CREATE TABLE IF NOT EXISTS player_week_usage (
  season smallint NOT NULL,
  season_type text NOT NULL CHECK (season_type IN ('PRE', 'REG', 'POST')),
  week smallint NOT NULL,
  team_abbr text NOT NULL,
  gsis_id text NOT NULL,
  player_name text NOT NULL,
  position text NOT NULL,
  offense_snaps smallint,
  snap_pct numeric,
  pass_attempts smallint,
  passing_yards integer,
  passing_tds smallint,
  interceptions smallint,
  carries smallint,
  rushing_yards integer,
  rushing_tds smallint,
  targets smallint,
  receptions smallint,
  receiving_yards integer,
  receiving_tds smallint,
  receiving_air_yards integer,
  fantasy_points_ppr numeric,
  rush_share numeric,
  rb_rush_share numeric,
  target_share numeric,
  air_yards_share numeric,
  touch_share numeric,
  team_carries smallint,
  team_targets smallint,
  team_air_yards integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, season_type, week, gsis_id)
);

CREATE INDEX IF NOT EXISTS idx_player_week_usage_team
  ON player_week_usage (season, season_type, team_abbr, week);

CREATE INDEX IF NOT EXISTS idx_player_week_usage_name
  ON player_week_usage (player_name);

ALTER TABLE player_week_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_week_usage read" ON player_week_usage;
CREATE POLICY "player_week_usage read" ON player_week_usage
  FOR SELECT TO anon, authenticated USING (true);
