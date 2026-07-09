-- Social posts log
-- Tracks which fragrances have been featured as FOTD to avoid repeats,
-- and logs all social posting activity for analytics.

create table if not exists social_posts_log (
  id           uuid primary key default gen_random_uuid(),
  entity_slug  text not null,          -- fragrance slug or other entity
  post_type    text not null,          -- 'fotd', 'dupe_highlight', 'manual', etc.
  platform     text not null,          -- 'bluesky', 'threads', 'twitter', 'reddit', 'multi'
  post_text    text,                   -- the actual post content (optional)
  external_id  text,                   -- platform's post ID (for tracking)
  created_at   timestamptz not null default now()
);

create index social_posts_log_slug_idx  on social_posts_log (entity_slug);
create index social_posts_log_type_idx  on social_posts_log (post_type);
create index social_posts_log_time_idx  on social_posts_log (created_at desc);

-- Prevent featuring the same fragrance as FOTD more than once per 60 days
-- (enforced in application logic, not SQL, since it's a soft constraint)

comment on table social_posts_log is
  'Audit log for all social posting activity. Used by FOTD generator to avoid repeats.';

-- ─── Daily feature table (optional app feature) ────────────────────────────────
-- If the app shows a "Today''s Pick" card on the home screen, this drives it.

create table if not exists daily_feature (
  id              uuid primary key default gen_random_uuid(),
  featured_date   date not null unique,     -- one feature per day
  fragrance_id    uuid not null references fragrances(id) on delete restrict,
  headline        text,                     -- short hook (used in app card)
  created_at      timestamptz not null default now()
);

create index daily_feature_date_idx on daily_feature (featured_date desc);
create index daily_feature_frag_idx on daily_feature (fragrance_id);

-- RLS: daily_feature is read-public (no auth needed to see today's pick)
alter table daily_feature enable row level security;

create policy "daily_feature_public_read"
  on daily_feature for select
  using (true);

-- social_posts_log is service-role only (written by automation, not users)
alter table social_posts_log enable row level security;

create policy "social_posts_log_service_only"
  on social_posts_log for all
  using (false)     -- no user access
  with check (false);
