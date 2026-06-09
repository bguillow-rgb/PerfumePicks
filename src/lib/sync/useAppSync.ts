import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useWardrobeStore, setWardrobeUserId } from '@/src/stores/useWardrobeStore';
import { useWearLogStore, setWearLogUserId } from '@/src/stores/useWearLogStore';
import { useSwipeStore, setSwipeUserId } from '@/src/stores/useSwipeStore';
import { useProfileStore } from '@/src/stores/useProfileStore';
import { deriveTasteProfile, type TasteSignal } from '@/src/features/recommend/tasteProfile';
import { getFragranceFromStore } from '@/src/stores/useCatalogStore';

/**
 * useAppSync — mounts once in _layout.tsx.
 *
 * Responsibilities:
 *   1. On sign-in: fetch all user data from Supabase and hydrate local stores.
 *   2. On sign-out: clear all local store data (no data leakage between accounts).
 *   3. After hydration: recompute + upsert user_taste_profiles so recommendations
 *      are immediately accurate on a new device.
 *   4. Ensure a profiles row exists for the current user.
 *
 * Intentionally has no return value — it's a background effect, not a data source.
 * Screens read from the Zustand stores directly; this hook just keeps them warm.
 */
export function useAppSync(userId: string | null) {
  // Prevent concurrent syncs if userId reference changes rapidly (e.g. token refresh)
  const syncingRef = useRef(false);
  // Track the previous userId so we only wipe stores on a real sign-out transition
  // (non-null → null), not on first launch where userId starts as null.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      // Only clear stores when transitioning FROM a real user TO signed-out.
      // Do NOT wipe on first render (prevUserIdRef is undefined) or when the
      // user was never signed in — that would erase locally-added wardrobe items.
      const wasSignedIn = prevUserIdRef.current != null && prevUserIdRef.current !== undefined;
      prevUserIdRef.current = userId;
      if (!userId && wasSignedIn) {
        setWardrobeUserId(null);
        setWearLogUserId(null);
        setSwipeUserId(null);
        useWardrobeStore.getState().hydrate([]);
        useWearLogStore.getState().hydrate([]);
        useSwipeStore.getState().hydrate([]);
        useProfileStore.getState().setDisplayName('');
        useProfileStore.getState().setPhotoUri(null);
      }
      return;
    }
    prevUserIdRef.current = userId;

    // Register userId so write-through helpers can include it in rows.
    setWardrobeUserId(userId);
    setWearLogUserId(userId);
    setSwipeUserId(userId);

    if (syncingRef.current) return;
    syncingRef.current = true;

    (async () => {
      try {
        await Promise.all([
          ensureProfile(userId),
          hydrateWardrobe(userId),
          hydrateWearLogs(userId),
          hydrateSwipes(userId),
        ]);
        await syncTasteProfile(userId);
      } catch (e) {
        console.warn('[useAppSync] sync error:', e);
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [userId]);
}

// ─────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────

async function ensureProfile(userId: string) {
  // Upsert with ignoreDuplicates: only inserts if the row doesn't exist yet.
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.warn('[useAppSync] profile upsert failed:', error.message);
}

// ─────────────────────────────────────────────────────────────────────
// Wardrobe
// ─────────────────────────────────────────────────────────────────────

async function hydrateWardrobe(userId: string) {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) { console.warn('[useAppSync] wardrobe fetch failed:', error.message); return; }
  // Merge: preserve locally-created items that never made it to Supabase
  // (write failed, marked _unsynced) so they survive a sign-out → sign-in cycle.
  // This mirrors the same pattern used in hydrateWearLogs.
  const rows = data ?? [];
  const remoteIds = new Set(rows.map((r: any) => r.id));
  const unsynced = useWardrobeStore.getState().items.filter(
    (i) => i._unsynced && !remoteIds.has(i.id),
  );
  useWardrobeStore.getState().hydrate([...unsynced, ...rows]);
}

// ─────────────────────────────────────────────────────────────────────
// Wear Logs
// ─────────────────────────────────────────────────────────────────────

async function hydrateWearLogs(userId: string) {
  const { data, error } = await supabase
    .from('wear_logs')
    .select('*')
    .eq('user_id', userId)
    .order('worn_on', { ascending: false })
    .limit(500);   // cap at 500 most recent — enough for all analytics

  if (error) { console.warn('[useAppSync] wear logs fetch failed:', error.message); return; }
  if (data) {
    // Preserve locally-created logs that Supabase hasn't accepted yet (e.g. a log
    // for a fragrance the user tried but hasn't added to their wardrobe, where a
    // server-side FK or RLS may have rejected the write-through).
    // Without this merge, hydrate() replaces the full array and those logs vanish.
    const remoteIds = new Set(data.map((r: any) => r.id));
    const unsynced = useWearLogStore.getState().logs.filter(
      (l) => l._unsynced && !remoteIds.has(l.id),
    );
    useWearLogStore.getState().hydrate([...unsynced, ...data]);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Swipe Feedback
// ─────────────────────────────────────────────────────────────────────

async function hydrateSwipes(userId: string) {
  const { data, error } = await supabase
    .from('swipe_feedback')
    .select('fragrance_id, action, created_at')
    .eq('user_id', userId);

  if (error) { console.warn('[useAppSync] swipes fetch failed:', error.message); return; }
  if (!data) return;

  // Merge remote with local swipes that haven't synced yet.
  // For each fragrance, keep whichever record has the newer created_at so
  // swipes done just before closing the app (persisted in AsyncStorage but
  // not yet written to Supabase) are not lost on the next cold launch.
  const localSwipes = useSwipeStore.getState().list();
  const remoteMap = new Map(data.map((r: any) => [r.fragrance_id, r]));
  for (const local of localSwipes) {
    const remote = remoteMap.get(local.fragrance_id);
    if (!remote || local.created_at > remote.created_at) {
      remoteMap.set(local.fragrance_id, local);
    }
  }
  useSwipeStore.getState().hydrate([...remoteMap.values()]);
}

// ─────────────────────────────────────────────────────────────────────
// Taste Profile — recompute from hydrated stores + upsert
// ─────────────────────────────────────────────────────────────────────

const SIGNAL_WEIGHTS = {
  wear_high_rating: 3,
  wear_default: 1.5,
  have: 2,
  want: 1,
  tested: 0.5,
  sold_on: 2.5,
  swipe_love: 2.5,
  swipe_like: 1,
  swipe_dislike: -1.5,
} as const;

async function syncTasteProfile(userId: string) {
  const logs    = useWearLogStore.getState().logs;
  const items   = useWardrobeStore.getState().items;
  const swipes  = useSwipeStore.getState().list();

  const signals: TasteSignal[] = [];

  for (const w of logs) {
    const f = getFragranceFromStore(w.fragrance_id);
    if (!f) continue;
    const weight = w.rating != null && w.rating >= 4
      ? SIGNAL_WEIGHTS.wear_high_rating
      : SIGNAL_WEIGHTS.wear_default;
    signals.push({ fragrance: f, weight });
  }
  for (const i of items) {
    const f = getFragranceFromStore(i.fragrance_id);
    if (!f) continue;
    const w = (SIGNAL_WEIGHTS as Record<string, number>)[i.status] ?? 1;
    signals.push({ fragrance: f, weight: w });
  }
  for (const sw of swipes) {
    const f = getFragranceFromStore(sw.fragrance_id);
    if (!f) continue;
    if (sw.action === 'love')    signals.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_love });
    if (sw.action === 'like')    signals.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_like });
    if (sw.action === 'dislike') signals.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_dislike });
    // 'skip' is intentionally unweighted — a neutral pass carries no signal.
  }

  if (signals.length === 0) return;

  const profile = deriveTasteProfile(signals);

  const { error } = await supabase
    .from('user_taste_profiles')
    .upsert({
      user_id: userId,
      liked_notes:       profile.liked_notes,
      disliked_notes:    profile.disliked_notes,
      preferred_accords: profile.preferred_accords,
      preferred_families: profile.preferred_families,
      avg_price_tier:    profile.avg_price_tier,
      longevity_preference: profile.longevity_preference,
      signal_count:      profile.signal_count,
      last_updated:      new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) console.warn('[useAppSync] taste profile upsert failed:', error.message);
}
