-- Same story URL can appear on multiple content_date rows (one per issue window).
alter table newsletter_raw_items drop constraint if exists newsletter_raw_items_url_hash_key;

create unique index if not exists newsletter_raw_items_url_hash_content_date_idx
  on newsletter_raw_items (url_hash, content_date);

alter table newsletter_issues
  add column if not exists league_footnotes jsonb not null default '[]';
