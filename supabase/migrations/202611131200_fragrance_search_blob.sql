-- Make notes and accords searchable.
--
-- WHY: over 2026-10-14..11-12, 36% of real assistant searches against
-- search_fragrances returned nothing, and about a third of those were people
-- describing a scent rather than naming a product — "white tea ginger bergamot
-- sandalwood", "plum rose oud niche perfume", "fig heart base niche perfume".
-- Those can never match, because search only ever looked at name_normalized and
-- slug. The notes and accords they describe are already stored on the row.
--
-- WHY A TRIGGER AND NOT A GENERATED COLUMN: array_to_string is STABLE, not
-- IMMUTABLE, so Postgres refuses it in a GENERATED expression. The usual
-- workaround is to wrap it in a function falsely declared IMMUTABLE, which
-- silently corrupts any index built on it if the behaviour ever changes. A
-- trigger keeps the column honest.
--
-- The blob is normalised with pp_normalize, the same IMMUTABLE function behind
-- name_normalized, so a query normalised by the server matches it on the same
-- terms. Note that pp_normalize collapses hyphens, so the accord "warm-spicy"
-- lands in the blob as "warm spicy"; the server splits query terms on hyphens
-- to agree with that.

alter table public.fragrances add column if not exists search_blob text;

comment on column public.fragrances.search_blob is
  'Normalised name + note pyramid + accords + family, for profile searches ("white tea bergamot sandalwood"). Maintained by fragrances_set_search_blob; never write it directly.';

create or replace function public.pp_fragrance_search_blob(
  p_name text,
  p_top text[],
  p_heart text[],
  p_base text[],
  p_accords text[],
  p_family text
) returns text
language sql
immutable
parallel safe
as $$
  -- pp_normalize is STRICT, so a null input would null the whole blob.
  select public.pp_normalize(
    concat_ws(' ',
      coalesce(p_name, ''),
      coalesce(array_to_string(p_top, ' '), ''),
      coalesce(array_to_string(p_heart, ' '), ''),
      coalesce(array_to_string(p_base, ' '), ''),
      coalesce(array_to_string(p_accords, ' '), ''),
      coalesce(p_family, '')
    )
  );
$$;

create or replace function public.pp_set_search_blob() returns trigger
language plpgsql
as $$
begin
  new.search_blob := public.pp_fragrance_search_blob(
    new.name, new.top_notes, new.heart_notes, new.base_notes,
    new.top_accords, new.fragrance_family
  );
  return new;
end
$$;

drop trigger if exists fragrances_set_search_blob on public.fragrances;
create trigger fragrances_set_search_blob
  before insert or update on public.fragrances
  for each row execute function public.pp_set_search_blob();

-- Backfill every existing row.
update public.fragrances
   set search_blob = public.pp_fragrance_search_blob(
     name, top_notes, heart_notes, base_notes, top_accords, fragrance_family)
 where search_blob is null;

-- Trigram index: the server matches with ilike '%term%', which no btree can serve.
create index if not exists fragrances_search_blob_trgm
  on public.fragrances using gin (search_blob gin_trgm_ops);

-- No GRANTs needed: search_blob is a new COLUMN on an existing table, so it
-- inherits the table's existing privileges. The 2026-10-30 Data API change only
-- withholds auto-grants from newly CREATED tables, views and matviews.
