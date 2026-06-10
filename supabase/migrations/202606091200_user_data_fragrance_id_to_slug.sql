-- 202606091200_user_data_fragrance_id_to_slug.sql
--
-- ROOT-CAUSE FIX: user-data tables keyed fragrance_id as uuid, but the app
-- keys EVERY fragrance on its slug (see useCatalogStore: "App-level fragrance
-- ID = slug ... UUID is Supabase-internal only"). Custom on-device bottles
-- don't even have a UUID. So every write of these tables failed with 22P02:
--   invalid input syntax for type uuid: "james-bond-007-quantum"
-- and every read keyed on slug failed the same way. Result: wardrobe_items,
-- wear_logs, compliments_log, fragrance_reviews, layering_entries were
-- effectively dead; swipe_feedback held only 2 ancient pre-slug rows.
--
-- Fix: convert the fragrance-key columns from uuid -> text(slug) on ALL six
-- affected columns across five tables, matching how the app and the dupes
-- RPCs already operate. We do NOT re-add FKs to fragrances(slug): the app
-- legitimately stores custom on-device fragrance ids (custom-*) that are not
-- in the catalog. Referential integrity at the DB layer is deliberately
-- given up here; the catalog is the source of truth client-side.
--
-- layering_entries: its check (fragrance_a_id < fragrance_b_id) compared
-- uuids; under text it would compare slugs with Postgres collation, which
-- disagrees with the client's JS string ordering (useLayeringStore canonical
-- ordering). We drop that brittle cross-language check and instead enforce
-- dedup with unique (user_id, fragrance_a_id, fragrance_b_id). The client
-- still canonicalizes a<b before insert, so the pair is stable.
--
-- get_collab_recs is the only RPC whose RETURN TYPE declared fragrance_id
-- uuid; recreated as text. get_scent_twins / get_year_in_review only use the
-- column internally and survive unchanged.
--
-- PRE-FLIGHT: all five tables were verified tiny before running (ALTER TYPE
-- rewrites the table under ACCESS EXCLUSIVE — safe only while small).
-- ROLLBACK: text -> uuid does not auto-cast back once slugs land. Rollback =
-- restore from PITR / snapshot. Confirm before running.

begin;

-- ── wardrobe_items ───────────────────────────────────────────────────────
alter table wardrobe_items drop constraint if exists wardrobe_items_fragrance_id_fkey;
alter table wardrobe_items alter column fragrance_id type text using fragrance_id::text;

-- ── wear_logs ──────────────────────────────────────────────────────────--
alter table wear_logs drop constraint if exists wear_logs_fragrance_id_fkey;
alter table wear_logs alter column fragrance_id type text using fragrance_id::text;

-- ── swipe_feedback (2 legacy rows) ───────────────────────────────────────
alter table swipe_feedback drop constraint if exists swipe_feedback_fragrance_id_fkey;
alter table swipe_feedback alter column fragrance_id type text using fragrance_id::text;
update swipe_feedback s
   set fragrance_id = f.slug
  from fragrances f
 where f.id::text = s.fragrance_id;

-- ── compliments_log ──────────────────────────────────────────────────────
alter table compliments_log drop constraint if exists compliments_log_fragrance_id_fkey;
alter table compliments_log alter column fragrance_id type text using fragrance_id::text;

-- ── fragrance_reviews ─────────────────────────────────────────────────────
alter table fragrance_reviews drop constraint if exists fragrance_reviews_fragrance_id_fkey;
alter table fragrance_reviews alter column fragrance_id type text using fragrance_id::text;

-- ── layering_entries (two fragrance columns + brittle check) ─────────────
alter table layering_entries drop constraint if exists layering_entries_fragrance_a_id_fkey;
alter table layering_entries drop constraint if exists layering_entries_fragrance_b_id_fkey;
alter table layering_entries drop constraint if exists layering_entries_check;
alter table layering_entries alter column fragrance_a_id type text using fragrance_a_id::text;
alter table layering_entries alter column fragrance_b_id type text using fragrance_b_id::text;
alter table layering_entries
  add constraint layering_entries_user_pair_key
  unique (user_id, fragrance_a_id, fragrance_b_id);

-- ── get_collab_recs: only RPC whose RETURN TYPE declared fragrance_id uuid.
-- Return type changes uuid->text, so the existing function must be dropped
-- first (CREATE OR REPLACE cannot change a function's return type).
drop function if exists get_collab_recs(uuid, int);
create or replace function get_collab_recs(target_user uuid, rec_limit int default 10)
returns table (fragrance_id text, score float)
language sql security definer stable set search_path = public as $$
  with my_accords as (
    select preferred_accords
    from user_taste_profiles
    where user_id = target_user
  ),
  similar_users as (
    select utp.user_id
    from user_taste_profiles utp, my_accords ma
    where utp.user_id != target_user
      and ma.preferred_accords is not null
      and exists (
        select 1 from jsonb_object_keys(utp.preferred_accords::jsonb) k
        where ma.preferred_accords::jsonb ? k
      )
    limit 50
  ),
  their_loves as (
    select sf.fragrance_id, count(*)::float as love_count
    from swipe_feedback sf
    join similar_users su on sf.user_id = su.user_id
    where sf.action in ('love', 'like')
    group by sf.fragrance_id
  ),
  already_seen as (
    select fragrance_id from swipe_feedback where user_id = target_user
    union
    select fragrance_id from wardrobe_items where user_id = target_user
  )
  select tl.fragrance_id, tl.love_count as score
  from their_loves tl
  where tl.fragrance_id not in (select fragrance_id from already_seen)
  order by tl.love_count desc
  limit rec_limit;
$$;

grant execute on function get_collab_recs(uuid, int) to authenticated;
comment on function get_collab_recs(uuid, int) is
  'Collaborative filtering: top N fragrances loved by users with similar preferred_accords, excluding already-swiped and owned fragrances. fragrance_id is the app-level slug.';

commit;
