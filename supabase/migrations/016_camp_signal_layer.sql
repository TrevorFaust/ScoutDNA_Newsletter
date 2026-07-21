-- Camp signal layer: extract momentum from raw items, propose battle changes, approve before apply.

-- 1. Atomic signals from raw items (one row per player/slot/item)
CREATE TABLE IF NOT EXISTS camp_player_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_date date NOT NULL,
  team_abbr text NOT NULL,
  position text NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE')),
  slot text NOT NULL,
  player_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('up', 'down', 'neutral')),
  strength smallint NOT NULL CHECK (strength BETWEEN 1 AND 3),
  signal_type text NOT NULL CHECK (
    signal_type IN (
      'camp_rep', 'coach_quote', 'beat_report', 'practice_snap', 'injury', 'rumor'
    )
  ),
  summary text NOT NULL,
  raw_item_id uuid NOT NULL,
  source_url text,
  source_tier smallint NOT NULL DEFAULT 3 CHECK (source_tier BETWEEN 1 AND 5),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (raw_item_id, player_name, slot)
);

CREATE INDEX IF NOT EXISTS idx_camp_player_signals_team_date
  ON camp_player_signals (team_abbr, content_date DESC);

CREATE INDEX IF NOT EXISTS idx_camp_player_signals_slot
  ON camp_player_signals (team_abbr, slot, player_name, content_date DESC);

-- 2. Rolling aggregates per battle candidate
CREATE TABLE IF NOT EXISTS camp_slot_scores (
  season smallint NOT NULL DEFAULT 2026,
  team_abbr text NOT NULL,
  position text NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE')),
  slot text NOT NULL,
  player_name text NOT NULL,
  window_days smallint NOT NULL DEFAULT 7,
  score numeric NOT NULL DEFAULT 0,
  signal_count int NOT NULL DEFAULT 0,
  up_count int NOT NULL DEFAULT 0,
  down_count int NOT NULL DEFAULT 0,
  last_signal_at timestamptz,
  trend text NOT NULL DEFAULT 'flat' CHECK (trend IN ('rising', 'falling', 'flat')),
  top_source_tier smallint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, team_abbr, position, slot, player_name)
);

CREATE INDEX IF NOT EXISTS idx_camp_slot_scores_team
  ON camp_slot_scores (team_abbr, slot);

-- 3. Proposals awaiting editor approval (never auto-applied)
CREATE TABLE IF NOT EXISTS camp_battle_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season smallint NOT NULL DEFAULT 2026,
  team_abbr text NOT NULL,
  position text NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE')),
  slot text NOT NULL,
  proposal_type text NOT NULL CHECK (
    proposal_type IN (
      'settle_slot', 'strengthen_lean', 'widen_battle', 'narrow_battle', 'reopen_slot'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'expired', 'snoozed')
  ),
  current_state jsonb NOT NULL,
  proposed_state jsonb NOT NULL,
  rationale text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low', 'medium', 'high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  reject_reason text,
  snooze_until timestamptz
);

CREATE INDEX IF NOT EXISTS idx_camp_battle_proposals_pending
  ON camp_battle_proposals (status, created_at DESC)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_camp_battle_proposals_one_pending
  ON camp_battle_proposals (season, team_abbr, position, slot, proposal_type)
  WHERE status = 'pending';

-- 4. Audit log for approved changes
CREATE TABLE IF NOT EXISTS camp_battle_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES camp_battle_proposals (id),
  season smallint NOT NULL,
  team_abbr text NOT NULL,
  position text NOT NULL,
  slot text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by text
);

CREATE INDEX IF NOT EXISTS idx_camp_battle_change_log_team
  ON camp_battle_change_log (team_abbr, approved_at DESC);

-- RLS: public read (same pattern as fantasy_position_battles)
ALTER TABLE camp_player_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_slot_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_battle_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_battle_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "camp_player_signals read" ON camp_player_signals;
CREATE POLICY "camp_player_signals read" ON camp_player_signals FOR SELECT USING (true);

DROP POLICY IF EXISTS "camp_slot_scores read" ON camp_slot_scores;
CREATE POLICY "camp_slot_scores read" ON camp_slot_scores FOR SELECT USING (true);

DROP POLICY IF EXISTS "camp_battle_proposals read" ON camp_battle_proposals;
CREATE POLICY "camp_battle_proposals read" ON camp_battle_proposals FOR SELECT USING (true);

DROP POLICY IF EXISTS "camp_battle_change_log read" ON camp_battle_change_log;
CREATE POLICY "camp_battle_change_log read" ON camp_battle_change_log FOR SELECT USING (true);
