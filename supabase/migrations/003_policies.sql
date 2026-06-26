-- Allow public newsletter signup
create policy "Public insert subscribers"
  on subscribers for insert
  with check (true);

-- Allow reading own subscriber row by email (optional future auth)
alter table subscribers enable row level security;
