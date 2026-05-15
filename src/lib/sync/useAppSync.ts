import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useSwipeStore } from '@/src/stores/useSwipeStore';
import { useProStore } from '@/src/stores/useProStore';
import { deriveTasteProfile, type TasteSignal } from '@/src/features/recommend/tasteProfile';
import { getFragranceFromStore } from '@/src/stores/useCatalogStore';
import { captureException } from '@/src/lib/observability';

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

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      // Sign-out: clear all remote-backed stores so a new sign-in starts fresh.
      if (!userId) {
        useWardrobeStore.getState().hydrate([]);
        useWearLogStore.getState().hydrate([]);
        useSwipeStore.getState().hydrate([]);
      }
      return;
    }

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
        await crossCheckProStatus();
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
  if (data) useWardrobeStore.getState().hydrate(data);
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
  if (data) useWearLogStore.getState().hydrate(data);
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
  if (data) useSwipeStore.getState().hydrate(data);
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
    if (sw.action === 'like')    signals.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_like });
    if (sw.action === 'dislike') signals.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_dislike });
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

// ─────────────────────────────────────────────────────────────────────
// Pro status cross-check
// ─────────────────────────────────────────────────────────────────────

/**
 * Verify the client's Pro state agrees with the server. The server is
 * authoritative (profiles.is_pro flipped by the RC webhook). If the two
 * disagree, trust the server and log the mismatch to Sentry.
 *
 * This prevents a modded build from permanently keeping isPro=true in
 * AsyncStorage and also catches the case where a subscription lapses
 * server-side but the local flag hasn't been cleared.
 */
async function crossCheckProStatus() {
  const { data, error } = await supabase.rpc('my_pro_status');
  if (error) {
    console.warn('[useAppSync] pro cross-check failed:', error.message);
    return;
  }
  if (!data) return;

  const serverPro = data.is_pro === true;
  const clientPro = useProStore.getState().isPro;

  if (serverPro && !clientPro) {
    useProStore.getState().activate();
    console.log('[useAppSync] Pro activated from server');
  } else if (!serverPro && clientPro) {
    useProStore.getState().deactivate();
    captureException(new Error('Pro mismatch: client=true, server=false'), {
      context: 'pro_cross_check',
    });
    console.warn('[useAppSync] Pro deactivated — server disagrees with client');
  }
}
