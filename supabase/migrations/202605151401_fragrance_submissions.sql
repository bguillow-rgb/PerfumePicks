-- fragrance_submissions — community-submitted fragrances from the scan no-match flow.
-- Held for moderation before entering the public catalog.

create table if not exists fragrance_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  device_id text not null,
  brand text not null,
  name text not null,
  concentration text,              -- EDP, EDT, Extrait, etc.
  notes text,                      -- freeform user notes
  scan_image_id uuid references scan_images(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_fragrance_submissions_status on fragrance_submissions(status);

alter table fragrance_submissions enable row level security;

create policy "Users can read own submissions"
  on fragrance_submissions for select
  using (auth.uid() = user_id);

create policy "Authenticated users can insert submissions"
  on fragrance_submissions for insert
  with check (auth.uid() = user_id);

create policy "Service role full access on fragrance_submissions"
  on fragrance_submissions for all
  using (auth.role() = 'service_role');
