-- Celebrity / famous person associations for fragrances.
-- "Who wears this" — a high-value data point for conversion and SEO.

create table if not exists fragrance_celebrities (
  id             uuid primary key default gen_random_uuid(),
  fragrance_id   uuid not null references fragrances(id) on update cascade on delete cascade,
  celebrity_name text not null,
  category       text,           -- 'actor', 'musician', 'model', 'royal', 'athlete', 'influencer', etc.
  source         text,           -- 'interview', 'paparazzi', 'brand_ambassador', 'manual'
  source_url     text,           -- link to the article/interview/photo
  image_url      text,           -- optional headshot URL
  verified       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- One row per fragrance+celebrity combo.
alter table fragrance_celebrities add constraint uniq_fragrance_celebrity unique (fragrance_id, celebrity_name);

create index fragrance_celebrities_frag_idx on fragrance_celebrities (fragrance_id);
create index fragrance_celebrities_name_idx on fragrance_celebrities using gin (celebrity_name gin_trgm_ops);

-- RLS: public read, service-role write.
alter table fragrance_celebrities enable row level security;

create policy "celebrities_select_all" on fragrance_celebrities
  for select using (true);
