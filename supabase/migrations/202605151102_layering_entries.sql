-- Layering entries — pairs of fragrances worn together.
-- check constraint ensures fragrance_a_id < fragrance_b_id to prevent
-- duplicate pairs in reverse order.

create table if not exists layering_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  fragrance_a_id  uuid not null references fragrances(id) on update cascade on delete restrict,
  fragrance_b_id  uuid not null references fragrances(id) on update cascade on delete restrict,
  notes           text,
  created_at      timestamptz not null default now(),
  check (fragrance_a_id < fragrance_b_id)
);

create index layering_entries_user_idx on layering_entries (user_id);
create index layering_entries_a_idx on layering_entries (fragrance_a_id);
create index layering_entries_b_idx on layering_entries (fragrance_b_id);
