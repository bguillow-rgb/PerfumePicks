-- RPC: collaborative filtering recommendations.
-- Returns top N fragrances loved by users whose preferred_accords
-- overlap with the target user. Excludes fragrances the user has
-- already swiped on or has in their wardrobe.

create or replace function get_collab_recs(target_user uuid, rec_limit int default 10)
returns table (fragrance_id uuid, score float)
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
      -- Simple overlap: any shared key in the JSONB preferred_accords
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
  'Collaborative filtering: top N fragrances loved by users with similar preferred_accords, excluding already-swiped and owned fragrances.';
