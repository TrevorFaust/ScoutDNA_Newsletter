-- NFL draft capital from nflverse (PFR); populated by sync_nflverse.py.
-- rookies_2026.round/pick may be placeholders when seeded from nflverse players.csv — use this table instead.

CREATE TABLE IF NOT EXISTS draft_picks_2026 (
  season smallint NOT NULL DEFAULT 2026,
  team_abbr text NOT NULL,
  round smallint NOT NULL,
  overall_pick smallint NOT NULL,
  player_name text NOT NULL,
  position text,
  gsis_id text,
  college text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, overall_pick)
);

CREATE INDEX IF NOT EXISTS idx_draft_picks_2026_team ON draft_picks_2026 (team_abbr);
CREATE INDEX IF NOT EXISTS idx_draft_picks_2026_name ON draft_picks_2026 (player_name);

ALTER TABLE draft_picks_2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "draft_picks_2026 read" ON draft_picks_2026;
CREATE POLICY "draft_picks_2026 read"
ON draft_picks_2026
FOR SELECT
USING (true);
