-- 202605220012_fragrance_id_safety.sql
-- Soft-delete / redirect support for fragrances.
-- When a fragrance needs to be "removed", set merged_into_id instead of deleting.
-- Read queries resolve redirects; hard DELETE is never used in production.

alter table fragrances
  add column if not exists merged_into_id uuid references fragrances(id);

create index if not exists fragrances_merged_idx on fragrances (merged_into_id)
  where merged_into_id is not null;

-- Ensure FK columns on dependent tables use ON UPDATE CASCADE so a fragrance_id
-- rename / key rotation propagates automatically. Most FKs were created without
-- ON UPDATE CASCADE in the initial schema; patch them here.
-- (fragrance_retailer_links and fragrance_celebrities already have it from their
-- own migrations — skip those.)

-- wardrobe_items
alter table wardrobe_items
  drop constraint if exists wardrobe_items_fragrance_id_fkey;
alter table wardrobe_items
  add constraint wardrobe_items_fragrance_id_fkey
  foreign key (fragrance_id) references fragrances(id)
  on update cascade on delete cascade;

-- wear_logs
alter table wear_logs
  drop constraint if exists wear_logs_fragrance_id_fkey;
alter table wear_logs
  add constraint wear_logs_fragrance_id_fkey
  foreign key (fragrance_id) references fragrances(id)
  on update cascade on delete cascade;

-- swipe_feedback
alter table swipe_feedback
  drop constraint if exists swipe_feedback_fragrance_id_fkey;
alter table swipe_feedback
  add constraint swipe_feedback_fragrance_id_fkey
  foreign key (fragrance_id) references fragrances(id)
  on update cascade on delete cascade;

-- user_taste_profiles does not directly FK fragrances — its JSONB fields store
-- note/accord weights by name, not fragrance_id. No change needed.
