-- Announcement reach: a durable impression record, and a denominator for it.
--
-- Until now the only trace of a founder message reaching anyone was a PostHog
-- `announcement_shown` event. Two problems with that as the sole record:
--   1. No server-side truth. A dropped event (app killed before flush, offline,
--      analytics opt-out) undercounts silently and is unfalsifiable afterwards.
--   2. No denominator. "2 people saw it" is unreadable without knowing how many
--      COULD have. Most of the base never opens the app inside a message's
--      window, so a small number may be the ceiling rather than a failure.
--
-- PostHog stays the behavioural layer; this is the auditable one.

-- ── 1. Durable impressions ────────────────────────────────────────────────────
-- PK (announcement_id, user_id) makes the write idempotent: the client marks
-- "seen" in AsyncStorage only on dismiss, so a force-quit re-shows the modal and
-- re-fires the event. Events therefore over-count; distinct rows here do not.
create table if not exists public.announcement_impressions (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  shown_at        timestamptz not null default now(),
  dismissed_at    timestamptz,
  cta_tapped_at   timestamptz,
  primary key (announcement_id, user_id)
);

create index if not exists announcement_impressions_ann_idx
  on public.announcement_impressions (announcement_id);

alter table public.announcement_impressions enable row level security;

-- A user writes only their own row. Reads are founder-only: impressions are
-- audience data, not something one user should be able to enumerate.
drop policy if exists ai_insert_own on public.announcement_impressions;
create policy ai_insert_own on public.announcement_impressions
  for insert with check (auth.uid() = user_id);

drop policy if exists ai_update_own on public.announcement_impressions;
create policy ai_update_own on public.announcement_impressions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists ai_read_founder on public.announcement_impressions;
create policy ai_read_founder on public.announcement_impressions
  for select using (
    auth.uid() in (
      '5fb2b8cc-8ba1-4125-89be-ef5e1befd925',
      'f4810587-d519-49d3-8121-d9fdd8239159'
    )
  );

-- ── 2. The denominator ────────────────────────────────────────────────────────
alter table public.announcements
  add column if not exists eligible_at_publish  integer,
  add column if not exists eligible_computed_at timestamptz;

comment on column public.announcements.eligible_at_publish is
  'Signed-in, non-founder profiles matching this audience at the moment it went live. Guests are not counted (they have no profile row), so this is a floor for audience "all".';

-- Counted at publish, not read-time: the audience keeps growing after a message
-- goes live, and a denominator that drifts upward would make every message look
-- progressively worse for no reason.
create or replace function public.announcement_eligible_count(aud text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from profiles p
  where p.id not in (
          '5fb2b8cc-8ba1-4125-89be-ef5e1befd925',
          'f4810587-d519-49d3-8121-d9fdd8239159')
    and case aud
          when 'pro'  then p.is_pro and (p.pro_expires_at is null or p.pro_expires_at > now())
          when 'free' then not (p.is_pro and (p.pro_expires_at is null or p.pro_expires_at > now()))
          else true
        end;
$$;

create or replace function public.announcements_stamp_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Stamp once, when it first goes live. Re-activating a message later keeps the
  -- original figure so the number always means "audience when this shipped".
  if new.active and new.eligible_at_publish is null then
    new.eligible_at_publish  := public.announcement_eligible_count(new.audience);
    new.eligible_computed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_announcements_stamp_eligible on public.announcements;
create trigger trg_announcements_stamp_eligible
before insert or update of active, audience on public.announcements
for each row execute function public.announcements_stamp_eligible();

-- ── 3. Reporting ──────────────────────────────────────────────────────────────
create or replace view public.announcement_reach as
select
  a.id, a.title, a.audience, a.active,
  a.starts_at::date as starts_on,
  a.eligible_at_publish,
  count(i.user_id)::int                                        as reached_users,
  count(i.dismissed_at)::int                                   as dismissed,
  count(i.cta_tapped_at)::int                                  as cta_tapped,
  round(100.0 * count(i.user_id)
        / nullif(a.eligible_at_publish, 0), 1)                 as pct_of_eligible
from public.announcements a
left join public.announcement_impressions i on i.announcement_id = a.id
group by a.id, a.title, a.audience, a.active, a.starts_at, a.eligible_at_publish
order by a.starts_at desc;

-- Backfill: the one message already live predates the trigger.
update public.announcements
set eligible_at_publish  = public.announcement_eligible_count(audience),
    eligible_computed_at = now()
where active and eligible_at_publish is null;
