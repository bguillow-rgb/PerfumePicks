-- RPC: sum total AI cost for today (all users).
create or replace function sum_ai_cost_today()
returns int language sql security definer stable set search_path = public as $$
  select coalesce(sum(cost_usd_cents), 0)::int
  from ai_usage
  where day = current_date;
$$;

grant execute on function sum_ai_cost_today() to service_role;

-- RPC: increment AI usage for a user+day (atomic upsert).
create or replace function increment_ai_usage(
  p_user_id uuid,
  p_day date,
  p_tokens_in int,
  p_tokens_out int,
  p_cost_cents int
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into ai_usage (user_id, day, tokens_in, tokens_out, cost_usd_cents, request_count)
  values (p_user_id, p_day, p_tokens_in, p_tokens_out, p_cost_cents, 1)
  on conflict (user_id, day) do update set
    tokens_in = ai_usage.tokens_in + excluded.tokens_in,
    tokens_out = ai_usage.tokens_out + excluded.tokens_out,
    cost_usd_cents = ai_usage.cost_usd_cents + excluded.cost_usd_cents,
    request_count = ai_usage.request_count + 1,
    updated_at = now();
end;
$$;

grant execute on function increment_ai_usage(uuid, date, int, int, int) to service_role;
