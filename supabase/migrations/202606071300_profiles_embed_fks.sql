-- profiles_embed_fks
--
-- Fixes BUG-1 (Community SOTD rail is dead) and the same latent defect on
-- fragrance reviews.
--
-- Root cause: PostgREST resolves embeds via foreign keys. `wear_logs.user_id`
-- and `fragrance_reviews.user_id` both reference auth.users(id), and
-- `profiles.id` also references auth.users(id). The tables are only connected
-- TRANSITIVELY through auth.users, so PostgREST cannot satisfy a
-- `profiles(display_name)` embed and returns:
--   "Could not find a relationship between 'wear_logs' and 'profiles'".
--
-- Fix: add an explicit FK from each user_id straight to profiles(id). This is
-- safe because profiles.id IS the auth.users id for every row (profiles.id
-- references auth.users(id)), so any user_id that satisfies the existing
-- auth.users FK also satisfies this one. We keep the existing auth.users FK,
-- which means user_id now has TWO FKs — embeds must therefore name the
-- constraint to disambiguate (see useSOTDFeed.ts / ReviewSection.tsx):
--   profiles!wear_logs_user_id_profiles_fkey(display_name)
--   profiles!fragrance_reviews_user_id_profiles_fkey(display_name)
--
-- NOT VALID + VALIDATE keeps the lock window short on existing rows: the ADD
-- takes only a brief ACCESS EXCLUSIVE lock to record the constraint, then
-- VALIDATE scans under a weaker SHARE UPDATE EXCLUSIVE lock. Rows orphaned
-- from profiles (a wear_log/review whose author has no profiles row) would
-- make VALIDATE fail — see the guard query in the rollout notes.

begin;

alter table wear_logs
  add constraint wear_logs_user_id_profiles_fkey
  foreign key (user_id) references profiles(id) on delete cascade
  not valid;

alter table fragrance_reviews
  add constraint fragrance_reviews_user_id_profiles_fkey
  foreign key (user_id) references profiles(id) on delete cascade
  not valid;

commit;

-- Validate outside the txn above so each scan commits independently.
alter table wear_logs validate constraint wear_logs_user_id_profiles_fkey;
alter table fragrance_reviews validate constraint fragrance_reviews_user_id_profiles_fkey;

-- Make PostgREST pick up the new relationships immediately.
notify pgrst, 'reload schema';
