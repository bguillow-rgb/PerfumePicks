-- Perfume Picks — RLS policies for SOTD social tables.
-- Companion to 003_sotd_social.sql.

-- ------------------------------------------------------------------
-- PROFILES
-- Users can read any profile (needed for the community feed / follow
-- graph). Users can only write their own row.
-- ------------------------------------------------------------------
alter table profiles enable row level security;

create policy "profiles_public_read"
  on profiles for select using (true);

create policy "profiles_owner_insert"
  on profiles for insert with check (auth.uid() = id);

create policy "profiles_owner_update"
  on profiles for update using (auth.uid() = id);

-- ------------------------------------------------------------------
-- WEAR LOGS — update existing owner-only policies to also allow
-- public SELECT on rows where is_public = true.
--
-- Drop and recreate the select policy from 002_rls_policies.sql.
-- The other three (insert, update, delete) stay owner-only.
-- ------------------------------------------------------------------
drop policy if exists "wear_logs_owner_select" on wear_logs;

create policy "wear_logs_select"
  on wear_logs for select
  using (
    auth.uid() = user_id          -- owner always sees their own
    or is_public = true           -- anyone sees public entries
  );

-- ------------------------------------------------------------------
-- FOLLOWS
-- Anyone authenticated can follow/unfollow.
-- Anyone (including anon) can read the follow graph (needed for
-- follower/following counts on public profiles).
-- ------------------------------------------------------------------
alter table follows enable row level security;

create policy "follows_public_read"
  on follows for select using (true);

create policy "follows_auth_insert"
  on follows for insert with check (auth.uid() = follower_id);

create policy "follows_owner_delete"
  on follows for delete using (auth.uid() = follower_id);

-- ------------------------------------------------------------------
-- WEAR LOG REACTIONS
-- Anyone can read reactions (needed for counts on the feed).
-- Authenticated users can add/remove their own reactions only.
-- ------------------------------------------------------------------
alter table wear_log_reactions enable row level security;

create policy "reactions_public_read"
  on wear_log_reactions for select using (true);

create policy "reactions_auth_insert"
  on wear_log_reactions for insert with check (auth.uid() = user_id);

create policy "reactions_owner_delete"
  on wear_log_reactions for delete using (auth.uid() = user_id);
