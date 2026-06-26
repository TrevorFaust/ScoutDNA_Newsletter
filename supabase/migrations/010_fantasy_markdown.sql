-- Separate fantasy analysis block per team section (compose output).
ALTER TABLE newsletter_sections
  ADD COLUMN IF NOT EXISTS fantasy_markdown text;
