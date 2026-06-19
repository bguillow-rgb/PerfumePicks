-- Perfume Picks — Fragrance DNA M10: durable pick-stream event log.
--
-- The privacy-clean, append-only record of every committed DNA picker run. This
-- is the raw material that LATER trains the learned/cohort journey ladders (today
-- they're editorial). On day one it only CAPTURES — nothing reads it back yet.
--
-- Privacy + integrity invariants (mirror src/features/dna/pickStream.ts):
--   • id is deterministic = `${app_id}:${session_id}:${seq}` → idempotent upsert
--     (onConflict:'id'); an offline retry re-writes the same row, never a dup.
--   • seq is monotonic within a session → stream order is recoverable without
--     trusting wall-clock created_at.
--   • app_id is a ROTATING, pseudonymous per-app id (NOT the device id, NOT PII).
--     The event body is keyed to it; user_id exists ONLY for deletion-cascade.
--   • PII strip: the row carries fragrance ids + enums only — never names, notes,
--     prices, or free text.
--
-- Additive + reversible: one new table, no data moved or dropped.

create table if not exists dna_picker_events (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  app_id       text not null,
  session_id   text not null,
  seq          int  not null,
  kind         text not null check (kind in ('pick', 'hard_no', 'favorite', 'commit')),
  fragrance_id text,
  relation     text check (relation in ('own', 'want')),
  favorite     boolean not null default false,
  source       text not null check (source in ('picker', 'question_fallback', 'hybrid')),
  created_at   timestamptz not null default now(),
  -- One row per (session, seq): the idempotency guarantee, enforced server-side.
  unique (user_id, session_id, seq)
);

create index if not exists dna_picker_events_user_idx on dna_picker_events (user_id, created_at desc);
create index if not exists dna_picker_events_app_idx  on dna_picker_events (app_id, created_at desc);
create index if not exists dna_picker_events_session_idx on dna_picker_events (session_id, seq);

comment on table dna_picker_events is
  'Durable DNA pick-stream (V1.1 A8 / M10). Append-only, privacy-clean event log of committed picker runs; trains the cohort journey ladders later. id = app_id:session_id:seq (idempotent). app_id is rotating + pseudonymous; user_id is for deletion-cascade only.';
