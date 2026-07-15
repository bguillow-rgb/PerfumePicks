-- Brand aliases for search: "PDM Galloway", "SHL Panthea", "LV Meteore".
--
-- PROBLEM
-- Search matches query tokens against the brand NAME. Enthusiasts don't type the
-- name — they type the initialism. A creator reported these seven bottles as
-- missing from his collection, in his own words:
--     "PDM Galloway, Oajan, Sospiro Dolce Sonata, SHL Panthea, LV Meteore,
--      City of Stars, and Imagintion"
-- All seven are now in the catalog and all seven resolve by name, but "PDM
-- Galloway" / "SHL Panthea" / "LV Meteore" still return nothing, because no
-- column anywhere knows PDM means Parfums de Marly.
--
-- WHY A TABLE COLUMN AND NOT A CONSTANT IN THE APP
-- Aliases are data, and they accrete forever (every house has an initialism).
-- Putting them in Postgres means adding one is an INSERT, not an app release +
-- store review. scripts/data/brand-aliases.json already exists but is ETL-only:
-- it canonicalizes incoming FEED names at ingest ("By Kilian" -> "Kilian") and is
-- never read at runtime. Different job, deliberately not reused.
--
-- SCOPE
-- Only aliases that are NOT already substrings of the brand name are worth
-- storing — search does `name_normalized ilike '%token%'`, so "sospiro" already
-- finds "Sospiro Perfumes", "initio" already finds "Initio Parfums Privés", and
-- "777" already finds "Stéphane Humbert Lucas 777". Storing those would be dead
-- rows implying a mechanism that isn't doing anything.
--
-- Aliases are matched EXACTLY (array containment), never as a substring, so a
-- 2-char alias like "lv" is safe: it fires only when the user types exactly "lv",
-- and can't behave like `ilike '%lv%'` and drag in half the brand table.

alter table brands
  add column if not exists aliases text[] not null default '{}';

comment on column brands.aliases is
  'Lowercase search aliases matched EXACTLY (not substring) against query tokens — initialisms users actually type ("pdm" -> Parfums de Marly). Only store aliases that are NOT substrings of name_normalized; those already match via ilike. Add more with: update brands set aliases = aliases || ''{xyz}'' where name_normalized = ''...'';';

-- GIN so the overlap lookup (aliases && query_tokens) is indexed.
create index if not exists brands_aliases_gin_idx
  on brands using gin (aliases);

update brands set aliases = '{pdm}'  where name_normalized = 'parfums de marly';
update brands set aliases = '{shl}'  where name_normalized = 'stephane humbert lucas 777';
update brands set aliases = '{lv}'   where name_normalized = 'louis vuitton';
update brands set aliases = '{mfk}'  where name_normalized = 'maison francis kurkdjian';
update brands set aliases = '{adp}'  where name_normalized = 'acqua di parma';
update brands set aliases = '{tf}'   where name_normalized = 'tom ford';
update brands set aliases = '{ysl}'  where name_normalized = 'yves saint laurent';
update brands set aliases = '{jpg}'  where name_normalized = 'jean paul gaultier';
update brands set aliases = '{vr}'   where name_normalized = 'viktor rolf';
update brands set aliases = '{mmm}'  where name_normalized = 'maison margiela';
update brands set aliases = '{jm}'   where name_normalized in ('jo malone', 'jo malone london');
update brands set aliases = '{fm}'   where name_normalized = 'frederic malle';
update brands set aliases = '{elo}'  where name_normalized = 'etat libre d orange';
update brands set aliases = '{hdp}'  where name_normalized = 'histoires de parfums';
update brands set aliases = '{xj}'   where name_normalized = 'xerjoff';
update brands set aliases = '{cc}'   where name_normalized = 'clive christian';
update brands set aliases = '{sl}'   where name_normalized = 'serge lutens';

notify pgrst, 'reload schema';
