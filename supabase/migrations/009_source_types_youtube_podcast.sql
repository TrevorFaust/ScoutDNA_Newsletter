-- Allow youtube/podcast in source catalog (ingest still uses source_type on raw_items as text)
alter table newsletter_sources drop constraint if exists newsletter_sources_source_type_check;
alter table newsletter_sources add constraint newsletter_sources_source_type_check
  check (source_type in ('reddit', 'rss', 'twitter', 'news', 'youtube', 'podcast'));
