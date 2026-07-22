-- Promo code redemption — server-side, tamper-proof.
--
-- promo_codes + promo_redemptions already exist (created manually; influencer
-- free-Pro codes are inserted by hand). PromoCodeSheet was built against a
-- redeemPromoCode() that called a redeem-promo path that never existed. This RPC
-- IS that path.
--
-- SECURITY DEFINER because it grants a PAID entitlement (profiles.is_pro): the
-- client must never be able to flip Pro directly. All validation happens here,
-- for auth.uid() only, under a row lock so concurrent redemptions can't oversell
-- max_redemptions. Returns a jsonb {ok, duration_months?, message?} the client maps.

create or replace function redeem_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_norm text := upper(btrim(coalesce(p_code, '')));
  v_code promo_codes%rowtype;
  v_is_pro boolean;
begin
  -- Sign-in required, and NOT an anonymous guest (codes tie to a recoverable account).
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return jsonb_build_object('ok', false, 'message', 'Please sign in to redeem a code.');
  end if;
  if v_norm = '' then
    return jsonb_build_object('ok', false, 'message', 'Enter a code.');
  end if;

  -- Lock the code row so two redemptions can't both pass the max_redemptions check.
  select * into v_code from promo_codes where code = v_norm for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That code isn''t valid.');
  end if;
  if not v_code.active then
    return jsonb_build_object('ok', false, 'message', 'That code is no longer active.');
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('ok', false, 'message', 'That code has expired.');
  end if;
  if v_code.max_redemptions is not null and v_code.redeemed_count >= v_code.max_redemptions then
    return jsonb_build_object('ok', false, 'message', 'That code has been fully redeemed.');
  end if;
  if exists (select 1 from promo_redemptions where code = v_norm and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'message', 'You''ve already redeemed this code.');
  end if;

  select is_pro into v_is_pro from profiles where id = v_uid;
  if coalesce(v_is_pro, false) then
    return jsonb_build_object('ok', false, 'message', 'You''re already on Pro.');
  end if;

  -- Grant: extend from the later of now / any existing expiry (never shorten).
  update profiles
     set is_pro = true,
         pro_expires_at = greatest(coalesce(pro_expires_at, now()), now())
                          + make_interval(months => v_code.duration_months)
   where id = v_uid;

  insert into promo_redemptions (code, user_id, duration_months, redeemed_at)
    values (v_norm, v_uid, v_code.duration_months, now());

  update promo_codes set redeemed_count = redeemed_count + 1 where code = v_norm;

  return jsonb_build_object('ok', true, 'duration_months', v_code.duration_months);
end;
$$;

-- Only signed-in users can call it; anon is rejected inside anyway.
revoke all on function redeem_promo_code(text) from public, anon;
grant execute on function redeem_promo_code(text) to authenticated;

notify pgrst, 'reload schema';
