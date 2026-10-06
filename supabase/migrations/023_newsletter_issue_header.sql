-- Per-issue edition header: headline hook, deck, and notable storylines.
alter table newsletter_issues
  add column if not exists hook text,
  add column if not exists deck text,
  add column if not exists storylines jsonb not null default '[]'::jsonb;
