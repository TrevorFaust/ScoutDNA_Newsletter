-- nflverse roster + depth chart snapshots (populated by sync_nflverse.py).
CREATE TABLE IF NOT EXISTS rosters_2026 (
  gsis_id text PRIMARY KEY,
  team_abbr text NOT NULL,
  full_name text NOT NULL,
  position text NOT NULL,
  depth_chart_position text,
  jersey_number smallint,
  status text,
  years_exp smallint,
  college text,
  rookie_year smallint,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rosters_2026_team ON rosters_2026 (team_abbr);
CREATE INDEX IF NOT EXISTS idx_rosters_2026_name ON rosters_2026 (full_name);

CREATE TABLE IF NOT EXISTS depth_charts_2026 (
  id bigserial PRIMARY KEY,
  team_abbr text NOT NULL,
  player_name text NOT NULL,
  gsis_id text,
  pos_abb text,
  pos_name text,
  pos_grp text,
  pos_slot smallint,
  pos_rank smallint,
  snapshot_dt timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_abbr, gsis_id, pos_abb, pos_slot)
);

CREATE INDEX IF NOT EXISTS idx_depth_charts_2026_team ON depth_charts_2026 (team_abbr);
CREATE INDEX IF NOT EXISTS idx_depth_charts_2026_gsis ON depth_charts_2026 (gsis_id);

ALTER TABLE rosters_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE depth_charts_2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rosters_2026 read" ON rosters_2026;
CREATE POLICY "rosters_2026 read" ON rosters_2026 FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "depth_charts_2026 read" ON depth_charts_2026;
CREATE POLICY "depth_charts_2026 read" ON depth_charts_2026 FOR SELECT TO anon, authenticated USING (true);
