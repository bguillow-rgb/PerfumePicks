import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useWardrobeStore, setWardrobeUserId } from '@/src/stores/useWardrobeStore';
import { useWearLogStore, setWearLogUserId } from '@/src/stores/useWearLogStore';
import { useSwipeStore, setSwipeUserId } from '@/src/stores/useSwipeStore';
import { useProfileStore } from '@/src/stores/useProfileStore';
import { setTasteProfileUserId, hydrateTasteProfile, useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { setPickStreamUserId, useDnaPickStreamStore } from '@/src/stores/useDnaPickStreamStore';
import { deriveTasteProfile, EMPTY_TASTE_PROFILE, type TasteSignal, type DerivedTasteProfile } from '@/src/features/recommend/tasteProfile';
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
export function useAppSync(userId: string | null, isAnonymous: boolean = false) {
  // Prevent concurrent syncs if userId reference changes rapidly (e.g. token refresh)
  const syncingRef = useRef(false);
  // Track the previous userId so we only wipe stores on a real sign-out transition
  // (non-null → null), not on first launch where userId starts as null.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  // Track whether the PREVIOUS session was anonymous (a guest). This is what
  // distinguishes "guest creating their first real account" (carry data up)
  // from "guest poking around, then logging into an existing account" (flush).
  const prevIsAnonRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      // Only clear stores when transitioning FROM a real user TO signed-out.
      // Do NOT wipe on first render (prevUserIdRef is undefined) or when the
      // user was never signed in — that would erase locally-added wardrobe items.
      const wasSignedIn = prevUserIdRef.current != null && prevUserIdRef.current !== undefined;
      prevUserIdRef.current = userId;
      prevIsAnonRef.current = isAnonymous;
      if (!userId && wasSignedIn) {
        setWardrobeUserId(null);
        setWearLogUserId(null);
        setSwipeUserId(null);
        setTasteProfileUserId(null);
        setPickStreamUserId(null);
        useWardrobeStore.getState().hydrate([]);
        useWearLogStore.getState().hydrate([]);
        useSwipeStore.getState().hydrate([]);
        useProfileStore.getState().setDisplayName('');
        useProfileStore.getState().setPhotoUri(null);
      }
      return;
    }

    // The local Zustand stores persist to a SINGLE device-global key, not
    // per-user. So on any auth change, whatever account's data is sitting in
    // those stores must be reconciled against the account that just signed in.
    //
    //  - firstRun: cold launch / first mount. Merge server with any _unsynced
    //    local writes (genuine pending writes for this same account).
    //  - switchedAccount: the uid changed from one non-null account to a
    //    DIFFERENT one without passing through signed-out (e.g. guest → real
    //    via signInWithIdToken, which swaps the session with no null event).
    //    Login is authoritative here: the hydrators REPLACE local with server
    //    data so the previous account's collection can't bleed through — EXCEPT
    //    the one legitimate carry-up case (see below).
    const firstRun = prevUserIdRef.current === undefined;
    const switchedAccount =
      prevUserIdRef.current != null && prevUserIdRef.current !== userId;
    const prevWasAnon = prevIsAnonRef.current === true;
    prevUserIdRef.current = userId;
    prevIsAnonRef.current = isAnonymous;

    // Register userId so write-through helpers can include it in rows.
    setWardrobeUserId(userId);
    setWearLogUserId(userId);
    setSwipeUserId(userId);
    setTasteProfileUserId(userId);
    setPickStreamUserId(userId);
    // Drain any pick-stream rows captured offline / pre-sign-in now that the
    // user_id + a session are available for the idempotent mirror.
    useDnaPickStreamStore.getState().flush();

    // On a hard account switch, eagerly reset the (global) profile store so the
    // previous account's name/photo can't flash before hydrateProfile resolves.
    // Same for the DNA — clear it before hydrateTasteProfile pulls the signed-in
    // account's copy, so one account's Fragrance DNA can't bleed into another.
    if (switchedAccount) {
      useProfileStore.getState().setDisplayName('');
      useProfileStore.getState().setPhotoUri(null);
      useTasteProfileStore.getState().clearDna();
    }

    if (syncingRef.current) return;
    syncingRef.current = true;

    (async () => {
      try {
        await Promise.all([
          ensureProfile(userId),
          // Count today toward the login streak on every launch / sign-in,
          // regardless of which tab the user lands on. Idempotent per day.
          touchLoginStreak(),
          hydrateWardrobe(userId, switchedAccount, prevWasAnon),
          hydrateWearLogs(userId, switchedAccount, prevWasAnon),
          hydrateSwipes(userId, switchedAccount),
          // Only (re)hydrate the profile when the identity actually changed —
          // never on a same-user token refresh, which would clobber a photo the
          // user just picked this session before its server write lands.
          (firstRun || switchedAccount) ? hydrateProfile(userId) : Promise.resolve(),
          // Pull the durable Fragrance DNA for this account (last-write-wins on
          // the envelope's updatedAt, so a DNA just made on-device is kept).
          (firstRun || switchedAccount) ? hydrateTasteProfile(userId) : Promise.resolve(),
        ]);
        await syncTasteProfile(userId);
      } catch (e) {
        console.warn('[useAppSync] sync error:', e);
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [userId, isAnonymous]);
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

/**
 * Advance the LOGIN streak (consecutive days the app was opened) for the current
 * user. Distinct from the wear streak (profiles.current_streak), which only ticks
 * when a wear is logged. Passes the device's LOCAL calendar date so the midnight
 * boundary matches the user's timezone. Server-side (security definer + auth.uid())
 * the RPC is idempotent within a day, so calling it on every launch/foreground is
 * safe. Returns the resulting streak so callers (the Home pill) can render it
 * immediately. Exported so the Home screen can refresh on focus/foreground.
 */
export async function touchLoginStreak(): Promise<number | null> {
  if (!isSupabaseConfigured) return null;
  // Skip when there's no session (demo mode / pre-login) — auth.uid() would be
  // null and the RPC would raise. Anonymous guests DO have a session and count.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const localDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local tz
  const { data, error } = await supabase.rpc('touch_login_streak', { p_local_date: localDate });
  if (error) { console.warn('[touchLoginStreak] failed:', error.message); return null; }
  return typeof data === 'number' ? data : null;
}

/**
 * Re-hydrate the (device-global) profile store for the signed-in account.
 * Pulls the saved display_name/avatar_url from the profiles row, falling back
 * to OAuth identity metadata (full_name/name, avatar_url/picture) so a freshly
 * linked Apple/Google account shows its name and photo on first sign-in.
 */
async function hydrateProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  const { data: { user } } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as Record<string, any>;

  const name   = data?.display_name || meta.full_name || meta.name || '';
  const avatar = data?.avatar_url   || meta.avatar_url || meta.picture || null;

  const store = useProfileStore.getState();
  if (name) store.setDisplayName(name);
  store.setPhotoUri(avatar);
}

// ─────────────────────────────────────────────────────────────────────
// Wardrobe
// ─────────────────────────────────────────────────────────────────────

async function hydrateWardrobe(
  userId: string,
  switchedAccount = false,
  prevWasAnon = false,
) {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) { console.warn('[useAppSync] wardrobe fetch failed:', error.message); return; }
  const rows = data ?? [];
  const remoteIds = new Set(rows.map((r: any) => r.id));
  const local = useWardrobeStore.getState().items;

  if (switchedAccount) {
    // Login is authoritative. The ONLY case where we carry local data up is a
    // genuine first signup: the previous session was an anonymous guest AND the
    // target account has zero server rows. Then the guest's locally-held items
    // are migrated under the new uid. Any other switch REPLACES local with the
    // signed-in account's server data so the prior account can't bleed through.
    if (prevWasAnon && rows.length === 0 && local.length > 0) {
      const toUpsert = local.map(({ _unsynced, ...row }) => ({ ...row, user_id: userId }));
      const { error: upErr } = await supabase
        .from('wardrobe_items')
        .upsert(toUpsert, { onConflict: 'id' });
      if (upErr) {
        console.warn('[useAppSync] wardrobe migration upsert failed:', upErr.message);
        useWardrobeStore.getState().hydrate(toUpsert);
        return;
      }
      useWardrobeStore.getState().hydrate(toUpsert);
      return;
    }
    useWardrobeStore.getState().hydrate(rows);
    return;
  }

  // Cold launch / same-user refresh: merge server rows with any local writes
  // that failed to sync (so we never resurrect rows deleted on another device).
  const unsynced = local.filter((i) => i._unsynced && !remoteIds.has(i.id));
  useWardrobeStore.getState().hydrate([...unsynced, ...rows]);
}

// ─────────────────────────────────────────────────────────────────────
// Wear Logs
// ─────────────────────────────────────────────────────────────────────

async function hydrateWearLogs(
  userId: string,
  switchedAccount = false,
  prevWasAnon = false,
) {
  const { data, error } = await supabase
    .from('wear_logs')
    .select('*')
    .eq('user_id', userId)
    .order('worn_on', { ascending: false })
    .limit(500);   // cap at 500 most recent — enough for all analytics

  if (error) { console.warn('[useAppSync] wear logs fetch failed:', error.message); return; }
  const rows = data ?? [];
  const remoteIds = new Set(rows.map((r: any) => r.id));
  const local = useWearLogStore.getState().logs;

  if (switchedAccount) {
    // Authoritative login, mirroring hydrateWardrobe. Carry guest history up
    // only on a genuine first signup (prev anon + empty target account).
    if (prevWasAnon && rows.length === 0 && local.length > 0) {
      const toUpsert = local.map(({ _unsynced, ...row }) => ({ ...row, user_id: userId }));
      const { error: upErr } = await supabase
        .from('wear_logs')
        .upsert(toUpsert, { onConflict: 'id' });
      if (upErr) {
        console.warn('[useAppSync] wear log migration upsert failed:', upErr.message);
        useWearLogStore.getState().hydrate(toUpsert);
        return;
      }
      useWearLogStore.getState().hydrate(toUpsert);
      return;
    }
    useWearLogStore.getState().hydrate(rows);
    return;
  }

  const unsynced = local.filter((l) => l._unsynced && !remoteIds.has(l.id));
  useWearLogStore.getState().hydrate([...unsynced, ...rows]);
}

// ─────────────────────────────────────────────────────────────────────
// Swipe Feedback
// ─────────────────────────────────────────────────────────────────────

async function hydrateSwipes(userId: string, switchedAccount = false) {
  const { data, error } = await supabase
    .from('swipe_feedback')
    .select('fragrance_id, action, created_at')
    .eq('user_id', userId);

  if (error) { console.warn('[useAppSync] swipes fetch failed:', error.message); return; }
  if (!data) return;

  // Authoritative login: replace local swipes with the signed-in account's.
  if (switchedAccount) {
    useSwipeStore.getState().hydrate([...data]);
    return;
  }

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

/**
 * Recompute the taste profile from the current local stores and (when a userId
 * is supplied) upsert it to Supabase. Returns the derived profile so callers can
 * render it immediately without waiting on a server round-trip. Exported so the
 * Taste Profile screen and the end of a Train session can refresh on demand —
 * the auth-effect path is no longer the only thing that recomputes.
 */
export async function syncTasteProfile(userId: string | null): Promise<DerivedTasteProfile> {
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

  if (signals.length === 0) return { ...EMPTY_TASTE_PROFILE };

  const profile = deriveTasteProfile(signals);

  if (userId && isSupabaseConfigured) {
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

  return profile;
}

/**
 * Resolve the current user and recompute+persist the taste profile. Returns the
 * derived profile (computed from local stores) regardless of whether the upsert
 * lands, so screens can render fresh data instantly.
 */
export async function recomputeTasteProfile(): Promise<DerivedTasteProfile> {
  let userId: string | null = null;
  if (isSupabaseConfigured) {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }
  return syncTasteProfile(userId);
}
