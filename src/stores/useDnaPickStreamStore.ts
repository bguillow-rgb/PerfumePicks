import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isSupabaseConfigured } from '@/lib/supabase';
import { syncWrite } from '@/src/lib/sync/syncWrite';
import { track, EVENTS } from '@/src/lib/observability';
import type { DnaSeed, DnaSource } from '@/src/features/dna/types';
import {
  buildPickStreamBatch,
  eventToRow,
  resolveAppId,
  type PickStreamEvent,
  type RotatingAppId,
} from '@/src/features/dna/pickStream';

/**
 * Durable DNA pick-stream (V1.1 A8 / milestone M10).
 *
 * Captures the privacy-clean event log of each committed picker run, queues it
 * locally (offline-first, AsyncStorage-persisted), and mirrors it to the
 * `dna_picker_events` Supabase table with idempotent upserts (onConflict:'id').
 * Rows that fail to mirror keep `_unsynced:true` and are retried by `flush()`.
 *
 * The auth user_id is attached ONLY at write time for deletion-cascade — it is
 * never part of the persisted/clean event body (which is keyed to the rotating,
 * pseudonymous appId instead).
 */

interface QueuedEvent extends PickStreamEvent {
  _unsynced?: boolean;
  /** Failed mirror attempts so far. Drives backoff + the dead-letter cap. */
  _attempts?: number;
  /** Epoch ms before which flush() must NOT retry this row (backoff). */
  _nextRetryAt?: number;
  /** True once we've given up after MAX_SYNC_ATTEMPTS. Never retried again. */
  _dead?: boolean;
}

// Retry policy. Before this, a persistently-failing row retried on EVERY flush
// with no backoff and re-fired persist_failed_queued each time — a schema-cache
// outage in 2026-06 produced 5,375 events / 3,055 in one day from 3 users, and
// hammered Supabase. Now: exponential backoff, a hard attempt cap, and the
// analytics event fires once on first failure + once on give-up, never per retry.
const MAX_SYNC_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30_000; // 30s
const MAX_BACKOFF_MS = 30 * 60_000; // 30 min ceiling

// Backoff for the Nth attempt (1-based): 30s, 1m, 2m, 4m, 8m, 16m, 30m(capped)…
// Exported for unit testing — this schedule + MAX_SYNC_ATTEMPTS is what caps the
// retry storm, so it's the part worth pinning.
export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}
export const RETRY_POLICY = { MAX_SYNC_ATTEMPTS, BASE_BACKOFF_MS, MAX_BACKOFF_MS };

let _currentUserId: string | null = null;
export function setPickStreamUserId(uid: string | null) { _currentUserId = uid; }

function mirror(
  ev: QueuedEvent,
  set: (fn: (s: PickStreamState) => Partial<PickStreamState>) => void,
  get: () => PickStreamState,
) {
  if (!isSupabaseConfigured || !_currentUserId) return;
  const row = eventToRow(ev);
  syncWrite('dna_picker_events', { ...row, user_id: _currentUserId }, 'id').then((r) => {
    if (r.ok) {
      // Synced (idempotent upsert) — drop the row from the outbox entirely so the
      // persisted queue stays bounded to genuinely-pending work.
      set((s) => ({ queue: s.queue.filter((q) => q.id !== ev.id) }));
      return;
    }
    // Read the CURRENT attempt count outside the state updater so track() fires
    // exactly once per transition (updaters can run more than once).
    const attempts = (get().queue.find((q) => q.id === ev.id)?._attempts ?? 0) + 1;
    const dead = attempts >= MAX_SYNC_ATTEMPTS;
    if (attempts === 1) track(EVENTS.DNA_PERSIST_FAILED_QUEUED, { kind: ev.kind });
    if (dead) track(EVENTS.DNA_PERSIST_ABANDONED, { kind: ev.kind, attempts });
    set((s) => ({
      queue: s.queue.map((q) =>
        q.id === ev.id
          ? {
              ...q,
              _unsynced: true,
              _attempts: attempts,
              _nextRetryAt: dead ? undefined : Date.now() + backoffMs(attempts),
              _dead: dead,
            }
          : q,
      ),
    }));
  });
}

interface PickStreamState {
  queue: QueuedEvent[];
  appId: RotatingAppId | null;
  /** Record one committed picker run as an ordered, idempotent event batch. */
  recordRun: (args: { seeds: DnaSeed[]; source: DnaSource }) => void;
  /** Retry any rows that never made it to Supabase. */
  flush: () => void;
  unsyncedCount: () => number;
  /** Local wipe (e.g. after server-side deletion) — clears the queue + app id. */
  clear: () => void;
}

export const useDnaPickStreamStore = create<PickStreamState>()(
  persist(
    (set, get) => ({
      queue: [],
      appId: null,

      recordRun: ({ seeds, source }) => {
        // Rotate the pseudonymous app id when missing/expired, then build the
        // ordered batch keyed to it.
        const appId = resolveAppId(get().appId, Date.now(), () => Crypto.randomUUID());
        const session = Crypto.randomUUID();
        const events = buildPickStreamBatch({ seeds, source, appId: appId.value, session });

        const queued: QueuedEvent[] = events.map((e) => ({ ...e, _unsynced: true, _attempts: 0 }));
        set((s) => ({ appId, queue: [...s.queue, ...queued] }));

        for (const ev of queued) mirror(ev, set, get);
      },

      flush: () => {
        const now = Date.now();
        for (const ev of get().queue) {
          // Retry only rows that are pending, not dead-lettered, and past their
          // backoff window. This is what stops the retry storm.
          if (ev._unsynced && !ev._dead && (ev._nextRetryAt == null || ev._nextRetryAt <= now)) {
            mirror(ev, set, get);
          }
        }
      },

      // Genuinely-pending rows only (excludes dead-lettered ones, which will
      // never sync and shouldn't read as "still trying").
      unsyncedCount: () => get().queue.filter((q) => q._unsynced && !q._dead).length,

      clear: () => set({ queue: [], appId: null }),
    }),
    {
      name: STORAGE_KEYS.dnaPickStream,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ queue: s.queue, appId: s.appId }),
    },
  ),
);
