-- One device, one push.
--
-- push_tokens is keyed on user_id, so every account signed into the same phone
-- stores the SAME Expo device token on its own row. daily-sotd-push sends one
-- message per row, so a phone with three accounts received three identical
-- notifications every morning. (Confirmed 2026-09-02: one token held 3 active
-- rows, two more held 2 each; the other 102 were 1:1.)
--
-- A device belongs to whoever signed in last.

-- 1. Clean up what is already there: keep the newest row per token, retire the rest.
with ranked as (
  select user_id, token,
         row_number() over (partition by token order by updated_at desc, created_at desc) as rn
  from public.push_tokens
  where invalid_at is null
)
update public.push_tokens t
set invalid_at = now()
from ranked r
where t.user_id = r.user_id and t.token = r.token and r.rn > 1;

-- 2. Keep it that way: registering a device retires that token everywhere else.
create or replace function public.push_tokens_one_device_one_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invalid_at is null then
    update public.push_tokens
    set invalid_at = now()
    where token = new.token
      and user_id <> new.user_id
      and invalid_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_push_tokens_one_device_one_owner on public.push_tokens;
create trigger trg_push_tokens_one_device_one_owner
after insert or update of token, invalid_at on public.push_tokens
for each row execute function public.push_tokens_one_device_one_owner();
