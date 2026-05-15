-- Add mood column to wear_logs.
-- Schema first; UI consumes in M3.

alter table wear_logs
  add column if not exists mood text;

comment on column wear_logs.mood is
  'Optional mood tag: happy, relaxed, confident, romantic, focused. Nullable — most existing rows won''t have it.';
