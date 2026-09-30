-- Reader accounts for ScoutDNA (separate from DraftDNA public.profiles).

create table if not exists public.newsletter_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  favorite_team_slug text references public.newsletter_teams(slug) on delete set null,
  role text not null default 'reader' check (role in ('reader', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists newsletter_profiles_team_idx
  on public.newsletter_profiles (favorite_team_slug);

alter table public.newsletter_profiles enable row level security;

create policy "newsletter_profiles_select_own"
  on public.newsletter_profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "newsletter_profiles_update_own"
  on public.newsletter_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.newsletter_profiles_lock_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if auth.role() is distinct from 'service_role' then
      new.role := old.role;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists newsletter_profiles_lock_role on public.newsletter_profiles;
create trigger newsletter_profiles_lock_role
  before update on public.newsletter_profiles
  for each row
  execute function public.newsletter_profiles_lock_role();
