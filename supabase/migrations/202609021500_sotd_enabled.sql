-- Daily SOTD: move the user's on/off switch to the server.
--
-- Until now the Settings toggle only scheduled/cancelled a LOCAL 8am
-- notification on the device. The server push (daily-sotd-push) ignored it
-- entirely, so the two fired together every morning and a user turning the
-- daily "off" kept receiving the server one. The local twin is retired; this
-- column is what the toggle writes now.
--
-- Defaults true so every existing token keeps its current behaviour.
alter table public.push_tokens
  add column if not exists sotd_enabled boolean not null default true;

comment on column public.push_tokens.sotd_enabled is
  'Settings toggle for the daily SOTD push. false = exclude from daily-sotd-push.';
