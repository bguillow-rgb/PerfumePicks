-- 202607041600_referrals.sql
-- Feature A — DNA invite/referral loop attribution.
--
-- One row per attributed invitee: who invited them (inviter_id), which archetype
-- was the hook, and when. The invitee writes their own row on first launch after
-- opening an invite link (see src/lib/referral.ts flushReferral). First-touch
-- wins: an invitee can be attributed to exactly one inviter (unique invitee_id),
-- so a later/second invite link is a no-op (unique violation, handled client-side).
--
-- Also the durable edge Feature B (friends) will convert into a friend request:
-- the inviter→invitee relationship already exists here when B ships.

create table if not exists referrals (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references auth.users(id) on delete cascade,
  invitee_id  uuid not null references auth.users(id) on delete cascade,
  archetype   text,
  created_at  timestamptz not null default now(),
  -- First-touch attribution: each invitee credited once.
  unique (invitee_id),
  -- No self-referrals.
  constraint referrals_no_self check (inviter_id <> invitee_id)
);

create index if not exists referrals_inviter_idx on referrals (inviter_id, created_at desc);

comment on table referrals is
  'Feature A invite attribution: one row per invitee, crediting the inviter + the archetype hook. Written by the invitee (RLS: invitee_id = auth.uid()). First-touch (unique invitee_id).';

-- ------------------------------------------------------------------
-- RLS: the invitee inserts their own attribution; both parties can read the
-- edge (inviter to count their invites, invitee to see who brought them in).
-- Aggregate analytics read via the service role, which bypasses RLS.
-- ------------------------------------------------------------------
alter table referrals enable row level security;

create policy "referrals_insert_self_invitee"
  on referrals for insert
  with check (invitee_id = auth.uid() and inviter_id <> auth.uid());

create policy "referrals_read_party"
  on referrals for select
  using (inviter_id = auth.uid() or invitee_id = auth.uid());

notify pgrst, 'reload schema';
