-- Push analytics: send-ledger + open tracking.
--
-- Ports Pour Picks' notification_sends model so Perfume can answer "how many
-- pushes did we send, and how many were opened?" per campaign. Before this,
-- push_tokens.last_pushed_on was only a dedup marker (overwritten daily) and
-- opens were not recorded at all — the tap handler just routed and dropped it.
--
-- Additive only: new table + RPC. Nothing existing is touched.
--
-- Writers:
--   • daily-sotd-push edge function (service role) upserts one row per send.
--   • the app calls mark_notification_opened(send_id) from the tap handler.

-- One row per (campaign, user, local send-day). Same idempotency key as Pour's
-- notification_sends, so a same-day double-send can't create duplicates.
CREATE TABLE IF NOT EXISTS notification_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key  TEXT NOT NULL DEFAULT 'daily_sotd',
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  send_day      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent','failed','invalid_token')),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at     TIMESTAMPTZ,                       -- set by mark_notification_opened
  UNIQUE (campaign_key, user_id, send_day)
);

CREATE INDEX IF NOT EXISTS notification_sends_campaign_day_idx
  ON notification_sends (campaign_key, send_day);
CREATE INDEX IF NOT EXISTS notification_sends_user_idx
  ON notification_sends (user_id);

ALTER TABLE notification_sends ENABLE ROW LEVEL SECURITY;

-- Clients may read only their own rows. They never INSERT/UPDATE directly:
-- sends come from the service-role edge function; opens go through the
-- SECURITY DEFINER RPC below. (Service role bypasses RLS entirely.)
DROP POLICY IF EXISTS notification_sends_owner_select ON notification_sends;
CREATE POLICY notification_sends_owner_select ON notification_sends
  FOR SELECT USING (auth.uid() = user_id);

-- Stamp opened_at for the calling user's own send row. Idempotent (COALESCE
-- keeps the first open). Mirrors Pour's mark_notification_opened exactly.
CREATE OR REPLACE FUNCTION mark_notification_opened(p_send_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE notification_sends SET opened_at = COALESCE(opened_at, now())
   WHERE id = p_send_id AND user_id = v_uid;
END; $$;

REVOKE ALL ON FUNCTION mark_notification_opened(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_notification_opened(UUID) TO authenticated;
