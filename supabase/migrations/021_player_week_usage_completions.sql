-- Completions for QB usage tables (nflverse + ESPN slash stats).
ALTER TABLE player_week_usage
  ADD COLUMN IF NOT EXISTS completions smallint;
