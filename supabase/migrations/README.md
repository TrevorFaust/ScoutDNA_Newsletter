# Migrations

## Shared DraftDNA database (`paveh`) — has existing `public.teams`

**Do not run `001`–`003`.** They create `public.teams` and conflict with DraftDNA’s team table (colors, images, etc.).

**Run in order:**

1. `004_shared_database.sql` — `newsletter_*` tables  
2. `005_seed_newsletter_teams.sql` — 32 teams for the newsletter  
3. `006_newsletter_policies.sql` — RLS  

## Standalone Supabase project (no existing `teams`)

Only if the database is empty / newsletter-only:

1. `001_initial.sql`  
2. `002_seed_teams.sql`  
3. `003_policies.sql`  

## Later: link to DraftDNA `public.teams`

Optional column `newsletter_teams.draftdna_team_id` → `public.teams.id` for logos/colors in the UI.
