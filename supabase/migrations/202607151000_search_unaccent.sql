-- Accent-insensitive catalog search.
--
-- PROBLEM
-- useCatalogStore.search() matches with ILIKE against the raw `name`. Postgres
-- ILIKE is case-insensitive but NOT accent-insensitive, so typing the natural
-- spelling returned nothing at all:
--   'hermes'   -> 0 rows (stored 'Hermès')   -> 147 bottles unreachable
--   'lancome'  -> 0 rows (stored 'Lancôme')  -> 125 bottles unreachable
--   'stephane' -> 0 rows (stored 'Stéphane Humbert Lucas 777')
--   'meteore'  -> 0 rows (stored 'Météore')
-- Reaching those bottles required typing 'è'/'ô' — a long-press on the iOS
-- keyboard — so in practice they were invisible.
--
-- FIX
-- A STORED GENERATED column holding a normalized mirror of each name, with the
-- client normalizing the query the same way before it hits ILIKE.
--
-- Generated (not trigger-maintained, not a backfilled plain column) so Postgres
-- derives it and it can never drift from `name` — including for rows written by
-- the ETL scripts, which bypass the app entirely.
--
-- THE CONTRACT
-- pp_normalize() must stay character-for-character identical to
-- normalizeSearchText() in src/lib/normalizeText.ts, which is itself identical to
-- normalizeStr() in scripts/lib/affiliate-etl-base.ts (the function that already
-- builds every slug in the catalog). If the query and the stored mirror normalize
-- differently, the name silently stops being findable — the exact bug this fixes.
-- __tests__/lib/normalizeText.test.ts pins the JS side.
--
-- The JS is:
--   s.toLowerCase()
--    .normalize('NFKD')
--    .replace(/[̀-ͯ]/g, '')   // drop combining marks
--    .replace(/[^a-z0-9]+/g, ' ')
--    .trim()
-- Each step below is the Postgres equivalent, in the same order.
--
-- WHY normalize(NFKD) AND NOT translate()
-- A char-by-char translate() map cannot do this job alone, for two reasons:
--   1. The catalog stores MIXED Unicode forms. 'J''ai Fait Un Rêve - Clair' holds
--      a DECOMPOSED e + U+0302, not a precomposed 'ê'; a 1:1 map silently misses
--      it. (Verified against live data — it was the single mismatch in 5,757 names.)
--   2. translate() is strictly 1:1, so every character that decomposes to MORE
--      than one letter (ligatures ﬁ/ﬂ, digraphs ǆ, superscripts ²) needs its own
--      hand-maintained replace() pass.
-- normalize(..., NFKD) handles both natively: it is a compatibility decomposition,
-- so ligatures expand and every accent becomes base + combining mark, which the
-- regexp then drops. It is also the literal operation the JS calls, so the two
-- sides agree by construction rather than by a map someone has to keep in sync.
--
-- WHY NOT unaccent()
-- unaccent() is only STABLE (its dictionary can be reloaded), and generated
-- columns require IMMUTABLE. The common workaround is a wrapper that lies about
-- its volatility. normalize()/regexp_replace()/lower()/btrim() are all genuinely
-- immutable, so no lying is required.
--
-- Standalone letters (ø, æ, ß, đ) are deliberately NOT folded — they are not
-- accented forms of an ASCII letter and NFKD leaves them alone, so both sides
-- collapse them to a space via the [^a-z0-9] rule, exactly as the slugs already do.

create or replace function pp_normalize(s text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select btrim(
    regexp_replace(
      -- NFKD: 'é' -> 'e' + U+0301, 'ﬁ' -> 'fi'; then drop the combining marks.
      regexp_replace(normalize(lower(s), NFKD), U&'[\0300-\036F]', '', 'g'),
      -- Everything that isn't a-z0-9 collapses to a single space, matching JS.
      '[^a-z0-9]+', ' ', 'g'
    ),
    ' '
  );
$$;

comment on function pp_normalize(text) is
  'Lowercase + NFKD + strip accents + collapse non-alphanumerics to single spaces. Mirror of normalizeSearchText() in src/lib/normalizeText.ts. IMMUTABLE so it can back a generated column. NOTE: changing this body does NOT recompute existing name_normalized values — drop and re-add the generated columns if you do.';

alter table brands
  add column if not exists name_normalized text
  generated always as (pp_normalize(name)) stored;

alter table fragrances
  add column if not exists name_normalized text
  generated always as (pp_normalize(name)) stored;

-- Search is ilike '%token%', so it needs trigram indexes — same as the existing
-- fragrances_name_trgm_idx on the raw name (001_initial_schema.sql:107). Without
-- these, moving search off the indexed `name` trades an index scan for a seq scan
-- on every keystroke. pg_trgm is already enabled in 001.
create index if not exists brands_name_normalized_trgm_idx
  on brands using gin (name_normalized gin_trgm_ops);

create index if not exists fragrances_name_normalized_trgm_idx
  on fragrances using gin (name_normalized gin_trgm_ops);

-- PostgREST caches the schema. Without this the new columns 404 through the API
-- until it restarts — which would make the shipped client's search return NOTHING
-- rather than merely miss accents.
notify pgrst, 'reload schema';
