-- 202605220011_wardrobe_empty_status.sql
-- Extend wardrobe_items.status to include 'empty' (bottle finished).
-- PostgreSQL text + CHECK — no enum type to migrate, just update the constraint.

alter table wardrobe_items
  drop constraint if exists wardrobe_items_status_check;

alter table wardrobe_items
  add constraint wardrobe_items_status_check
  check (status in ('have','want','tested','sold_on','empty'));
