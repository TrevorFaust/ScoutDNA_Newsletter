-- Add a dedicated "projection" signal_type for pundit predictions/speculation
-- about who wins a position battle, as distinct from reports of things that
-- already happened (camp_rep, coach_quote, beat_report, practice_snap, injury).
-- Predictive/speculative content is still counted, but weighted well below
-- observed camp evidence -- see SIGNAL_TYPE_MULTIPLIER in camp_signals_common.py.

ALTER TABLE camp_player_signals DROP CONSTRAINT IF EXISTS camp_player_signals_signal_type_check;
ALTER TABLE camp_player_signals ADD CONSTRAINT camp_player_signals_signal_type_check
  CHECK (
    signal_type IN (
      'camp_rep', 'coach_quote', 'beat_report', 'practice_snap', 'injury', 'rumor', 'projection'
    )
  );
