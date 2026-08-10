// Mount-once watcher that surfaces the NPS sheet on a conservative schedule:
// after enough opens + real engagement, at most once every 90 days. Fully
// independent of the App Store review prompt (see nps.ts). Claims the shared
// feedback-modal lock so it can't stack on another prompt.
//
// Engagement is read from the local persisted stores rather than Supabase: the
// wardrobe and wear log are the app's own source of truth and are hydrated from
// AsyncStorage on launch, so this works offline and costs no round-trip.
// Signed-in only — a guest's score can't be tied to a durable identity.
//
// The cooldown is NOT started when the sheet appears — only once the user has
// actually answered (confirmed write) or explicitly declined. A failed submit
// leaves them eligible, so a network blip doesn't cost a quarter of silence.

import { useEffect, useState } from 'react';

import { claimFeedbackModal, releaseFeedbackModal } from '@/src/lib/feedbackModalGate';
import { markNpsAsked, shouldShowNps } from '@/src/lib/nps';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { NpsSheet } from './NpsSheet';

export function NpsWatcher() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await resolveCurrentUser();
      if (!user?.id || user.is_anonymous) return;

      const show = await shouldShowNps(
        () =>
          useWardrobeStore.getState().items.length > 0 ||
          useWearLogStore.getState().logs.length > 0
      );
      if (cancelled || !show) return;
      if (!claimFeedbackModal()) return;

      setVisible(true);
    })().catch(() => {
      // Best-effort; never block the app on NPS.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <NpsSheet
      visible={visible}
      onResolved={() => {
        void markNpsAsked();
      }}
      onClose={() => {
        setVisible(false);
        releaseFeedbackModal();
      }}
    />
  );
}
