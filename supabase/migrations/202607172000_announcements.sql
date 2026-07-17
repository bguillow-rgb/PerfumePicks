-- Perfume Picks — in-app announcements (founder → user messaging)
--
-- A dismissible "what's new" modal that pops on app load, authored by the founder
-- from an in-app composer (app/admin/announcements.tsx). Copy lives in the DB,
-- not the bundle, so a new message is a row insert — no app update, no OTA.
--
-- This is a BROADCAST from the founder to an audience, NOT user-to-user content,
-- so it does not re-open Apple Guideline 1.2 (UGC) the way friends/messaging would.
--
-- Client-side targeting:
--   audience 'all'  → everyone (guests included)
--   audience 'pro'  → Pro subscribers only
--   audience 'free' → non-Pro users only
-- Show-once is client-side (AsyncStorage set of seen ids), so "first launch" means
-- the first app open after the row goes active. starts_at / ends_at bound the live
-- window; active is the master on/off switch.
--
-- RLS: world-readable (guests included so 'all' reaches them); writes restricted to
-- the founder auth uids so the in-app composer publishes with the founder's own
-- session — no service-role key on device.

create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  active     boolean not null default false,
  audience   text not null default 'all' check (audience in ('all', 'pro', 'free')),
  emoji      text,                 -- optional glyph for the modal header
  title      text not null,
  body       text not null,
  cta_label  text,                 -- null → single dismiss button
  cta_route  text,                 -- null → CTA just dismisses; else an expo-router path
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,          -- null → no end
  created_at timestamptz not null default now()
);

alter table announcements enable row level security;

drop policy if exists announcements_read on announcements;
create policy announcements_read on announcements
  for select using (true);

-- Founder-only writes. Keep this list in sync with FOUNDER_USER_IDS in
-- src/lib/admin.ts. Covers insert / update / delete (publish, edit, deactivate).
-- These are the PERFUME PICKS auth uids (a different Supabase project than Pour
-- Picks — do not copy Pour Picks' uids here).
drop policy if exists announcements_founder_write on announcements;
create policy announcements_founder_write on announcements
  for all
  using (
    auth.uid() in (
      '5fb2b8cc-8ba1-4125-89be-ef5e1befd925',  -- bguillow@gmail.com (Google)
      'f4810587-d519-49d3-8121-d9fdd8239159'   -- bobguillow@icloud.com (Apple)
    )
  )
  with check (
    auth.uid() in (
      '5fb2b8cc-8ba1-4125-89be-ef5e1befd925',
      'f4810587-d519-49d3-8121-d9fdd8239159'
    )
  );

-- Inactive starter so the composer's "recent" list isn't empty on first open and
-- the founder can preview the modal before writing a real one.
insert into announcements (active, audience, emoji, title, body, cta_label, cta_route)
values (
  false,
  'all',
  '🌸',
  'Welcome to Perfume Picks',
  'This is how a note from us looks. Tap to preview it, edit it, or write your own from the composer.',
  'Got it',
  null
);
