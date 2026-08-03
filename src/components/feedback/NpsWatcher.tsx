// Mount-once watcher that surfaces the NPS sheet on a conservative schedule:
// after enough opens + real engagement, at most once every 90 days. Fully
// independent of the App Store review prompt (see nps.ts).
//
// Engagement is read from the local persisted stores rather than Supabase: the
// wardrobe and wear log are the app's own source of truth and are hydrated from
// AsyncStorage on launch, so this works offline and costs no round-trip.
// Signed-in only — a guest's score can't be tied to a durable identity.

import { useEffect, useState } from 'react';

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

      const hasEngaged =
        useWardrobeStore.getState().items.length > 0 ||
        useWearLogStore.getState().logs.length > 0;

      if (cancelled) return;
      if (!(await shouldShowNps(hasEngaged))) return;
      if (cancelled) return;

      await markNpsAsked();
      setVisible(true);
    })().catch(() => {
      // Best-effort; never block the app on NPS.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <NpsSheet visible={visible} onClose={() => setVisible(false)} />;
}
