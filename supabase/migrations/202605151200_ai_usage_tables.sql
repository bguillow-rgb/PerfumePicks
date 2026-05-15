-- AI usage tracking + cost guard infrastructure.

-- Per-user daily token usage for budget enforcement.
create table if not exists ai_usage (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  day          date not null default current_date,
  tokens_in    int not null default 0,
  tokens_out   int not null default 0,
  cost_usd_cents int not null default 0,
  request_count int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, day)
);

create index ai_usage_user_day_idx on ai_usage (user_id, day);

-- Per-IP daily request cap (hashed IP, no PII stored).
create table if not exists ai_ip_rate_limits (
  ip_hash      text not null,
  day          date not null default current_date,
  request_count int not null default 0,
  primary key (ip_hash, day)
);

-- App-wide settings (key-value). Service-role only write.
create table if not exists app_settings (
  key   text primary key,
  value text not null
);

-- Seed default cost guard values.
insert into app_settings (key, value) values
  ('ai_daily_budget_usd_cents', '5000'),     -- $50/day total
  ('ai_per_user_daily_cents', '100'),         -- $1/user/day
  ('ai_per_ip_daily_requests', '200'),        -- 200 requests/IP/day
  ('ai_new_account_multiplier', '0.1'),       -- 10% of normal for <24h accounts
  ('ai_kill_switch', '0')                     -- 0 = off, 1 = on
on conflict (key) do nothing;

-- RLS: ai_usage is service-role write, owner select.
alter table ai_usage enable row level security;
create policy "ai_usage_select_own" on ai_usage for select using (auth.uid() = user_id);

-- RLS: ip rate limits — service-role only.
alter table ai_ip_rate_limits enable row level security;

-- RLS: app_settings — public read, service-role write.
alter table app_settings enable row level security;
create policy "app_settings_select_all" on app_settings for select using (true);
