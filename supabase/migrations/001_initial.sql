-- DraftDNA NFL Newsletter — initial schema

create extension if not exists "pgcrypto";

-- 32 NFL teams
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  abbrev text not null unique,
  name text not null,
  conference text not null check (conference in ('AFC', 'NFC')),
  division text not null,
  division_order int not null,
  prev_season_wins int,
  prev_season_losses int,
  prev_season_ties int default 0,
  narrative_tier text check (narrative_tier in ('elite', 'contender', 'middling', 'rebuilding')),
  reddit_subreddit text,
  created_at timestamptz not null default now()
);

-- Configurable sources per team / global
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  source_type text not null check (source_type in ('reddit', 'rss', 'twitter', 'news')),
  label text not null,
  url text not null,
  tier int not null default 2 check (tier between 1 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Raw ingested items (one row per unique URL/post)
create table if not exists raw_items (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  source_id uuid references sources(id) on delete set null,
  url text not null,
  url_hash text not null unique,
  title text not null,
  body text,
  author text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  content_date date not null,
  source_type text not null,
  source_tier int default 2,
  flair text,
  engagement_score int default 0,
  team_ids uuid[] not null default '{}',
  tags text[] not null default '{}',
  metadata jsonb not null default '{}',
  included_in_issue boolean not null default false
);

create index if not exists raw_items_content_date_idx on raw_items(content_date);
create index if not exists raw_items_team_ids_idx on raw_items using gin(team_ids);

-- Deduped story clusters
create table if not exists story_clusters (
  id uuid primary key default gen_random_uuid(),
  content_date date not null,
  team_ids uuid[] not null default '{}',
  canonical_title text not null,
  summary_seed text,
  topic text,
  priority int not null default 50,
  raw_item_ids uuid[] not null default '{}',
  source_urls text[] not null default '{}',
  tags text[] not null default '{}',
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists story_clusters_content_date_idx on story_clusters(content_date);

-- Newsletter issues (daily / weekly)
create table if not exists newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  issue_date date not null,
  issue_type text not null check (issue_type in ('daily', 'weekly')),
  slug text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('collecting', 'draft', 'in_review', 'approved', 'published')),
  league_section text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (issue_date, issue_type)
);

-- Per-team generated content
create table if not exists newsletter_sections (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references newsletter_issues(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  intro_paragraphs text,
  rookie_paragraph text,
  activity_markdown text,
  talk_markdown text,
  footnotes jsonb not null default '[]',
  tags text[] not null default '{}',
  flags jsonb not null default '[]',
  is_empty boolean not null default false,
  empty_reason text,
  sort_order int not null,
  created_at timestamptz not null default now(),
  unique (issue_id, team_id)
);

-- Pipeline run logs
create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('collect', 'compose', 'publish')),
  content_date date,
  status text not null check (status in ('started', 'success', 'partial', 'failed')),
  items_collected int default 0,
  teams_with_items int default 0,
  error_message text,
  details jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Subscribers (Phase 2 email)
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  favorite_team_slug text,
  frequency text not null default 'daily'
    check (frequency in ('daily', 'weekly', 'both')),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Glossary (Phase 3 UI)
create table if not exists glossary_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  definition text not null,
  created_at timestamptz not null default now()
);

-- RLS: service role used by pipeline; anon read for published issues only (configure in dashboard)
alter table newsletter_issues enable row level security;
alter table newsletter_sections enable row level security;
alter table teams enable row level security;

create policy "Public read published issues"
  on newsletter_issues for select
  using (status = 'published');

create policy "Public read published sections"
  on newsletter_sections for select
  using (
    exists (
      select 1 from newsletter_issues i
      where i.id = issue_id and i.status = 'published'
    )
  );

create policy "Public read teams"
  on teams for select
  using (true);
