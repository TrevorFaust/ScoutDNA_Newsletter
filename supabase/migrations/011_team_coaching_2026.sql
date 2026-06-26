-- Combined HC / OC / DC staff for compose context (seed via pipeline sync or seed_coaching.py).
CREATE TABLE IF NOT EXISTS team_coaching_2026 (
  team_abbr text PRIMARY KEY,
  team_name text NOT NULL,
  hc_name text,
  hc_exp smallint,
  hc_record_2025 text,
  oc_name text,
  oc_since smallint,
  oc_previous_role text,
  dc_name text,
  dc_since smallint,
  dc_previous_role text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_coaching_2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_coaching_2026 read" ON team_coaching_2026;
CREATE POLICY "team_coaching_2026 read" ON team_coaching_2026
  FOR SELECT TO anon, authenticated USING (true);

COMMENT ON TABLE team_coaching_2026 IS
  '2026 coaching staff for newsletter compose (HC/OC/DC + prior roles). Join on team_abbr (PIT, HOU, …).';
