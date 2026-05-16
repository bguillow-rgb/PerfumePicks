-- scan_images — persists every scan for quota tracking, training loop, and analytics.
-- Device-scoped quota (not user-scoped) so Guest→signup→Guest can't reset the cap.

create table if not exists scan_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  device_id text not null,
  scan_method text not null default 'concierge'
    check (scan_method in ('concierge', 'describe', 'find_deeper')),
  image_url text,                          -- nullable for describe + find_deeper
  identified_fragrance_id uuid references fragrances(id) on delete set null,
  confidence real,
  user_confirmed boolean not null default false,
  refunded boolean not null default false,  -- true when scan yielded nothing usable
  raw_llm_response jsonb,
  created_at timestamptz not null default now()
);

-- Index for device-scoped quota queries
create index if not exists idx_scan_images_device_id on scan_images(device_id);
-- Index for per-user rate limit queries
create index if not exists idx_scan_images_user_id_created on scan_images(user_id, created_at);

-- RLS: owner can read their own scans; service role can write
alter table scan_images enable row level security;

create policy "Users can read own scans"
  on scan_images for select
  using (auth.uid() = user_id);

create policy "Service role full access on scan_images"
  on scan_images for all
  using (auth.role() = 'service_role');

-- Allow inserts from authenticated users (edge function uses service role,
-- but identifyService also inserts client-side via the user's JWT)
create policy "Authenticated users can insert scans"
  on scan_images for insert
  with check (auth.uid() = user_id);
