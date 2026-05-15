-- RPC: get_scent_twins — find users with similar taste via Jaccard on
-- wear_logs.fragrance_id. Returns top 10 candidate user IDs.

create or replace function get_scent_twins(target_user uuid)
returns table (twin_user_id uuid, overlap_count int, jaccard float)
language sql security definer stable set search_path = public as $$
  with my_fragrances as (
    select distinct fragrance_id from wear_logs where user_id = target_user
  ),
  other_users as (
    select user_id, fragrance_id
    from wear_logs
    where user_id != target_user
      and fragrance_id in (select fragrance_id from my_fragrances)
  ),
  overlap as (
    select
      ou.user_id as twin,
      count(distinct ou.fragrance_id)::int as shared,
      (select count(distinct fragrance_id) from my_fragrances)::int as my_total
    from other_users ou
    group by ou.user_id
  ),
  twin_totals as (
    select
      o.twin,
      o.shared,
      (select count(distinct fragrance_id) from wear_logs where user_id = o.twin)::int as their_total,
      o.my_total
    from overlap o
  )
  select
    tt.twin as twin_user_id,
    tt.shared as overlap_count,
    tt.shared::float / (tt.my_total + tt.their_total - tt.shared)::float as jaccard
  from twin_totals tt
  where tt.shared >= 2  -- minimum overlap threshold
  order by jaccard desc
  limit 10;
$$;

grant execute on function get_scent_twins(uuid) to authenticated;
comment on function get_scent_twins(uuid) is
  'Returns top 10 users with the most similar fragrance wear history (Jaccard similarity on fragrance_id sets). Requires at least 2 shared fragrances.';


-- RPC: get_year_in_review (Perfume Wrapped) — Pro-gated.
-- Returns a stat bundle for the given user + year.

create or replace function get_year_in_review(target_user uuid, target_year int)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'total_wears',
      (select count(*) from wear_logs
       where user_id = target_user
         and extract(year from worn_on::date) = target_year),
    'unique_fragrances',
      (select count(distinct fragrance_id) from wear_logs
       where user_id = target_user
         and extract(year from worn_on::date) = target_year),
    'top_fragrance_id',
      (select fragrance_id from wear_logs
       where user_id = target_user
         and extract(year from worn_on::date) = target_year
       group by fragrance_id
       order by count(*) desc
       limit 1),
    'top_fragrance_count',
      (select count(*) from wear_logs
       where user_id = target_user
         and extract(year from worn_on::date) = target_year
       group by fragrance_id
       order by count(*) desc
       limit 1),
    'most_worn_occasion',
      (select occasion from wear_logs
       where user_id = target_user
         and extract(year from worn_on::date) = target_year
         and occasion is not null
       group by occasion
       order by count(*) desc
       limit 1),
    'longest_streak',
      (select longest_streak from profiles where id = target_user),
    'wardrobe_count',
      (select count(*) from wardrobe_items
       where user_id = target_user and status = 'have'),
    'compliments_received',
      (select count(*) from compliments_log
       where user_id = target_user
         and extract(year from occurred_on) = target_year),
    'reviews_written',
      (select count(*) from fragrance_reviews
       where user_id = target_user
         and extract(year from created_at) = target_year)
  )
  where auth.uid() = target_user
    and is_pro_user(auth.uid());
$$;

grant execute on function get_year_in_review(uuid, int) to authenticated;
comment on function get_year_in_review(uuid, int) is
  'Perfume Wrapped stat bundle. Pro-gated: returns null if caller is not Pro or not the target user.';
