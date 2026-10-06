-- Make the free wardrobe cap real.
--
-- src/lib/limits.ts claimed "Real enforcement lives in Postgres RLS via
-- is_pro_user(uid)". It did not: the only policies on wardrobe_items are the
-- four ownership checks, so FREE_WARDROBE_CAP was advisory - enforced in
-- useWardrobeStore.add() and nowhere else. Anything that is not that store
-- (a sync path, a stale build, any non-app client) walked straight around it.
-- The data shows it: max wardrobe is 37 against a cap of 5.
--
-- Existing rows are never touched. Over-cap users keep everything they have;
-- they are only stopped from adding MORE while non-Pro.

create or replace function public.wardrobe_enforce_free_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap constant int := 5;  -- keep in sync with FREE_WARDROBE_CAP in src/lib/limits.ts
  current_count int;
begin
  -- Server-side callers (service role, edge functions, migrations) have no
  -- auth.uid(). They are trusted and must not be capped.
  if auth.uid() is null then
    return new;
  end if;

  -- An upsert of a row that already exists fires this BEFORE INSERT trigger too
  -- (Postgres evaluates it before conflict resolution). Re-syncing an existing
  -- item is not a new add, so let it through - otherwise a legitimately
  -- over-cap user could never sync their own wardrobe again.
  if exists (select 1 from wardrobe_items w where w.id = new.id) then
    return new;
  end if;

  if public.is_pro_user(new.user_id) then
    return new;
  end if;

  select count(*) into current_count from wardrobe_items w where w.user_id = new.user_id;
  if current_count >= cap then
    -- The client checks first and routes to the paywall; this is the backstop,
    -- so the message only ever surfaces to a caller that skipped that path.
    raise exception 'WARDROBE_CAP_REACHED: free tier is limited to % items', cap
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wardrobe_enforce_free_cap on public.wardrobe_items;
create trigger trg_wardrobe_enforce_free_cap
before insert on public.wardrobe_items
for each row execute function public.wardrobe_enforce_free_cap();
