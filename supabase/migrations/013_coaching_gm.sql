-- General manager column on coaching context table.

ALTER TABLE team_coaching_2026

  ADD COLUMN IF NOT EXISTS gm_name text;



COMMENT ON COLUMN team_coaching_2026.gm_name IS

  'General manager or top football executive (e.g. Howie Roseman, Omar Khan).';


