-- FK + soft-delete safety for fragrances.
-- Never DELETE a fragrance row — set merged_into_id instead.
-- Read queries should resolve redirects when merged_into_id is set.

alter table fragrances
  add column if not exists merged_into_id uuid references fragrances(id);

comment on column fragrances.merged_into_id is
  'Soft-delete redirect. When set, this fragrance has been merged into another. Queries should resolve the redirect. Never DELETE fragrance rows — set this instead.';

create index if not exists fragrances_merged_idx
  on fragrances (merged_into_id) where merged_into_id is not null;
