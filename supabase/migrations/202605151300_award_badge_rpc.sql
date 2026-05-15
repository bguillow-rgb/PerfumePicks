-- RPC: award a badge to a user. Security definer so it bypasses
-- the user_badges insert RLS (service-role only insert policy).
-- Called from the client after milestone checks.

create or replace function award_badge(p_user_id uuid, p_badge_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into user_badges (user_id, badge_key)
  values (p_user_id, p_badge_key)
  on conflict (user_id, badge_key) do nothing;
end;
$$;

grant execute on function award_badge(uuid, text) to authenticated;
