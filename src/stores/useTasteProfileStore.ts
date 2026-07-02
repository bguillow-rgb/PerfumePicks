import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { syncWrite } from '@/src/lib/sync/syncWrite';
import type { FragranceDNA } from '@/src/features/dna/types';
import type { BuyableRankResult } from '@/src/features/dna/score';

/**
 * useTasteProfileStore — the live, durable home of the user's Fragrance DNA.
 *
 * Design (DNA milestone M4 — "Persistence + Recs Read DNA"):
 *   - The committed `dna` is the single source of truth read by the recommender
 *     (via blendProfiles). It persists to AsyncStorage so a relaunch — even one
 *     that finished onboarding offline — lands a seeded Today instantly, no
 *     network required.
 *   - The server copy (user_taste_profiles.dna) is a MIRROR. Every commit writes
 *     to the store synchronously, then enqueues a debounced Supabase upsert. If
 *     the device is offline (or the app is backgrounded mid-write), the write
 *     stays in `pending` — persisted — and is flushed on the next sign-in /
 *     launch (setTasteProfileUserId → flushPending). That is the "reconcile on
 *     reconnect" path without a NetInfo native dependency.
 *   - Retake is atomic: a retake computes into `draft`; readers keep seeing the
 *     old `dna` until `commitDraft()` promotes draft→dna in one set(). Readers
 *     never observe a half-written profile.
 *
 * Debounce collapses the "5 rapid taps" case into one write; the upsert is
 * idempotent on (user_id), so a retried flush is harmless.
 */

/** One queued server write. Only the latest matters (last-write-wins). */
interface PendingWrite {
  dna: FragranceDNA;
  /** Envelope updatedAt — used to drop stale flushes and stale hydrations. */
  updatedAt: string;
}

interface TasteProfileState {
  /** The committed, live DNA the recommender reads. Null until the front door. */
  dna: FragranceDNA | null;
  /** In-progress retake. Never read by the recommender; promoted by commitDraft. */
  draft: FragranceDNA | null;
  /** Queued server write awaiting connectivity. Persisted so it survives a kill. */
  pending: PendingWrite | null;
  /** True once AsyncStorage rehydrated — gate DNA-conditional UI to avoid flash. */
  hasHydrated: boolean;
  /**
   * The buyable-match ranking computed in the picker session for the celebration
   * reveal (DNA flow v2 M2). RUNTIME-ONLY — deliberately NOT persisted: the
   * affiliate links + stock/price go stale, and it's only meaningful for the
   * one reveal that produced it. The canonical celebrate page + "more matches"
   * page read it; it's recomputed every fresh derivation. Null outside a reveal.
   */
  celebrateHero: BuyableRankResult | null;

  /** Commit a freshly derived DNA (first-run path). Atomic + enqueues a write. */
  setDna: (dna: FragranceDNA) => void;
  /** Write a retake-in-progress DNA to the draft slot (no reader impact). */
  setDraft: (dna: FragranceDNA) => void;
  /** Promote draft→dna in one atomic set, then enqueue. No-op if no draft. */
  commitDraft: () => void;
  /** Start a fresh retake — clears any stale draft. The live `dna` is untouched. */
  retake: () => void;
  /**
   * Commit a freshly recomputed living DNA (PRD §7.2 / §6.6). Unlike `setDna`
   * this does NOT clear `draft` — a recompute fires from background signals
   * (swipe/wear/wardrobe/foreground) and must not disturb an in-progress retake.
   * Replaces the old `applyBehaviorSignal` trait-nudge: the whole envelope is
   * re-derived from the unified signal pool, not patched axis-by-axis.
   */
  commitRecompute: (dna: FragranceDNA) => void;
  /**
   * Clear the one-time "You've shifted" nudge after the user has seen it
   * (PRD §6.6). No-op when there's no pending shift. Persists so the nudge
   * doesn't resurface on relaunch or another device.
   */
  acknowledgeArchetypeShift: () => void;
  /** Stash the picker-session buyable ranking for the canonical celebrate page
   *  + "more matches" page to read. Pass null to clear after the reveal. */
  setCelebrateHero: (result: BuyableRankResult | null) => void;
  /** Hydrate from the server WITHOUT enqueuing a write (used on sign-in). */
  hydrateDna: (dna: FragranceDNA) => void;
  /** Wipe DNA (sign-out / account switch flush). */
  clearDna: () => void;
  setHasHydrated: (v: boolean) => void;
}

// ── Module-level sync plumbing (kept out of the store like useAppSync) ──────

const DEBOUNCE_MS = 800;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Current user the DNA mirror belongs to. Runtime-only, set by useAppSync. */
let currentUserId: string | null = null;

/** Schedule a debounced flush of the pending write. Collapses rapid commits. */
function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, DEBOUNCE_MS);
}

/**
 * Attempt to write the queued DNA to Supabase. On success clears `pending`; on
 * failure (offline, mid-flight backgrounding) leaves it for the next flush.
 * Idempotent on (user_id) — only touches the `dna` column, so the typed
 * passive-taste columns written by syncTasteProfile are left intact.
 */
export async function flushPending(): Promise<void> {
  if (!isSupabaseConfigured || !currentUserId) return;
  const { pending } = useTasteProfileStore.getState();
  if (!pending) return;

  const result = await syncWrite(
    'user_taste_profiles',
    {
      user_id: currentUserId,
      dna: pending.dna,
      last_updated: new Date().toISOString(),
    },
    'user_id',
  );

  if (result.ok) {
    // Only clear if no newer write was queued while this one was in flight.
    const latest = useTasteProfileStore.getState().pending;
    if (latest && latest.updatedAt === pending.updatedAt) {
      useTasteProfileStore.setState({ pending: null });
    }
  }
  // On failure: keep `pending`; the next setTasteProfileUserId / launch retries.
}

function enqueue(dna: FragranceDNA) {
  useTasteProfileStore.setState({ pending: { dna, updatedAt: dna.updatedAt } });
  scheduleFlush();
}

export const useTasteProfileStore = create<TasteProfileState>()(
  persist(
    (set, get) => ({
      dna: null,
      draft: null,
      pending: null,
      hasHydrated: false,
      celebrateHero: null,

      setDna: (dna) => {
        set({ dna, draft: null });
        enqueue(dna);
      },

      setDraft: (dna) => set({ draft: dna }),

      commitDraft: () => {
        const { draft } = get();
        if (!draft) return;
        set({ dna: draft, draft: null });
        enqueue(draft);
      },

      retake: () => set({ draft: null }),

      commitRecompute: (dna) => {
        set({ dna });
        enqueue(dna);
      },

      acknowledgeArchetypeShift: () => {
        const cur = get().dna;
        if (!cur?.archetype.pendingShift) return;
        const dna: FragranceDNA = {
          ...cur,
          archetype: { ...cur.archetype, pendingShift: null },
        };
        set({ dna });
        enqueue(dna);
      },

      setCelebrateHero: (result) => set({ celebrateHero: result }),

      hydrateDna: (dna) => set({ dna }),

      clearDna: () => {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        set({ dna: null, draft: null, pending: null, celebrateHero: null });
      },

      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: STORAGE_KEYS.dnaProfile,
      storage: createJSONStorage(() => AsyncStorage),
      // hasHydrated is runtime-only. `dna` + `pending` persist (offline queue
      // survives a kill); `draft` deliberately does NOT — an abandoned retake
      // shouldn't resurrect on relaunch.
      partialize: (state) => ({ dna: state.dna, pending: state.pending }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // A write queued before the last kill: retry once the store is warm.
        if (state?.pending) scheduleFlush();
      },
    },
  ),
);

/**
 * Register the signed-in user the DNA mirror belongs to, and flush any write
 * that was queued offline. Called by useAppSync on every auth change / launch —
 * this is the "reconcile on reconnect" trigger (a fresh launch with network is
 * effectively a reconnect for a write made on a plane).
 */
export function setTasteProfileUserId(userId: string | null) {
  currentUserId = userId;
  if (userId) void flushPending();
}

/**
 * Hydrate the live DNA from the server for `userId`. Last-write-wins on the
 * envelope's `updatedAt`: the server copy only replaces the local one when it is
 * strictly newer, so a DNA just made on this device isn't clobbered by an older
 * server row (and vice-versa across devices).
 */
export async function hydrateTasteProfile(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase
    .from('user_taste_profiles')
    .select('dna')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.dna) return;

  const serverDna = data.dna as FragranceDNA;
  const local = useTasteProfileStore.getState().dna;
  if (!local || serverDna.updatedAt > local.updatedAt) {
    useTasteProfileStore.getState().hydrateDna(serverDna);
  }
}
