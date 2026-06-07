-- 202606071400_review_quick_takes.sql
-- PRD §7.7 — short, pithy "smells like…" takes + one-tap tags on reviews.
-- Enthusiasts want casual one-liners, not 7-paragraph essays, and a way to
-- read the quick statements first (the Parfumo behavior users praised).

alter table fragrance_reviews
  add column if not exists quick_take text check (quick_take is null or char_length(quick_take) <= 140),
  add column if not exists tags       text[] not null default '{}';
