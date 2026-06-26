alter table newsletter_issues enable row level security;
alter table newsletter_sections enable row level security;
alter table newsletter_teams enable row level security;

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

create policy "Public read newsletter teams"
  on newsletter_teams for select
  using (true);

create policy "Public insert newsletter subscribers"
  on newsletter_subscribers for insert
  with check (true);

alter table newsletter_subscribers enable row level security;
