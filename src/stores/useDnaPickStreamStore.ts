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
}

let _currentUserId: string | null = null;
export function setPickStreamUserId(uid: string | null) { _currentUserId = uid; }

function mirror(ev: QueuedEvent, set: (fn: (s: PickStreamState) => Partial<PickStreamState>) => void) {
  if (!isSupabaseConfigured || !_currentUserId) return;
  const row = eventToRow(ev);
  syncWrite('dna_picker_events', { ...row, user_id: _currentUserId }, 'id').then((r) => {
    if (!r.ok) {
      // Mirror failed — the row stays queued (_unsynced) for the next flush().
      track(EVENTS.DNA_PERSIST_FAILED_QUEUED, { kind: ev.kind });
    }
    set((s) => ({
      queue: s.queue.map((q) => (q.id === ev.id ? { ...q, _unsynced: !r.ok } : q)),
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

        const queued: QueuedEvent[] = events.map((e) => ({ ...e, _unsynced: true }));
        set((s) => ({ appId, queue: [...s.queue, ...queued] }));

        for (const ev of queued) mirror(ev, set);
      },

      flush: () => {
        for (const ev of get().queue) {
          if (ev._unsynced) mirror(ev, set);
        }
      },

      unsyncedCount: () => get().queue.filter((q) => q._unsynced).length,

      clear: () => set({ queue: [], appId: null }),
    }),
    {
      name: STORAGE_KEYS.dnaPickStream,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ queue: s.queue, appId: s.appId }),
    },
  ),
);
