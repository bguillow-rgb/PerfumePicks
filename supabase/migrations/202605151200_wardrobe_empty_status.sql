-- Migration: add 'empty' to wardrobe_items.status check constraint
-- Created: 2026-05-15
--
-- Competitive analysis row 23: users want to mark bottles as empty
-- (finished) rather than deleting or marking sold_on. Preserves the
-- history of ownership.

-- Drop the old constraint and recreate with the new value.
alter table wardrobe_items
  drop constraint if exists wardrobe_items_status_check;

alter table wardrobe_items
  add constraint wardrobe_items_status_check
  check (status in ('have', 'want', 'tested', 'sold_on', 'empty'));
