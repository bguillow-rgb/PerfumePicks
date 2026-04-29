import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';

/**
 * Private per-fragrance notes — F6 spec.
 *
 * Stored locally; when Supabase is wired, sync to `fragrance_notes` table.
 * All data is private to the user — never surfaced in community features.
 *
 * Schema mirrors the planned Supabase table:
 *   fragrance_notes(user_id, fragrance_id, body, occasion_prefs,
 *                   skin_performance, weather_prefs, social_notes,
 *                   layering_logs, updated_at)
 */

export type OccasionPref = 'office' | 'date' | 'casual' | 'evening' | 'formal' | 'workout' | 'travel';
export type WeatherPref  = 'hot-humid' | 'hot-dry' | 'warm' | 'cool' | 'cold' | 'rainy';
export type SkinPerf     = 'long-lasting' | 'fades-fast' | 'skin-close' | 'projects-well' | 'dries-different';

export interface LayeringEntry {
  id: string;
  paired_fragrance_id: string;
  paired_fragrance_name: string; // denormalised so display doesn't need catalog lookup
  note: string;
  created_at: string;
}

export interface FragranceNote {
  fragrance_id: string;
  body: string;                       // freeform main note
  occasion_prefs: OccasionPref[];
  weather_prefs: WeatherPref[];
  skin_performance: SkinPerf[];
  social_notes: string;               // compliments received, social reactions
  layering_logs: LayeringEntry[];
  updated_at: string;
}

interface FragranceNotesState {
  notes: Record<string, FragranceNote>; // keyed by fragrance_id
  /** Upsert the note record for a fragrance. */
  save: (fragrance_id: string, patch: Partial<Omit<FragranceNote, 'fragrance_id' | 'updated_at'>>) => void;
  /** Add a layering entry to an existing note record. */
  addLayeringEntry: (fragrance_id: string, entry: Omit<LayeringEntry, 'id' | 'created_at'>) => void;
  /** Remove a layering entry. */
  removeLayeringEntry: (fragrance_id: string, entry_id: string) => void;
  /** Get the note record for a fragrance, or null. */
  get: (fragrance_id: string) => FragranceNote | null;
  /** Search notes by freetext across all body + social_notes fields. */
  search: (query: string) => FragranceNote[];
}

function clientId(): string {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyNote(fragrance_id: string): FragranceNote {
  return {
    fragrance_id,
    body: '',
    occasion_prefs: [],
    weather_prefs: [],
    skin_performance: [],
    social_notes: '',
    layering_logs: [],
    updated_at: new Date().toISOString(),
  };
}

export const useFragranceNotesStore = create<FragranceNotesState>()(
  persist(
    (set, get) => ({
      notes: {},

      save: (fragrance_id, patch) => {
        set((s) => {
          const existing = s.notes[fragrance_id] ?? emptyNote(fragrance_id);
          return {
            notes: {
              ...s.notes,
              [fragrance_id]: {
                ...existing,
                ...patch,
                fragrance_id,
                updated_at: new Date().toISOString(),
              },
            },
          };
        });
      },

      addLayeringEntry: (fragrance_id, entry) => {
        set((s) => {
          const existing = s.notes[fragrance_id] ?? emptyNote(fragrance_id);
          const newEntry: LayeringEntry = {
            ...entry,
            id: clientId(),
            created_at: new Date().toISOString(),
          };
          return {
            notes: {
              ...s.notes,
              [fragrance_id]: {
                ...existing,
                layering_logs: [newEntry, ...existing.layering_logs],
                updated_at: new Date().toISOString(),
              },
            },
          };
        });
      },

      removeLayeringEntry: (fragrance_id, entry_id) => {
        set((s) => {
          const existing = s.notes[fragrance_id];
          if (!existing) return s;
          return {
            notes: {
              ...s.notes,
              [fragrance_id]: {
                ...existing,
                layering_logs: existing.layering_logs.filter((e) => e.id !== entry_id),
                updated_at: new Date().toISOString(),
              },
            },
          };
        });
      },

      get: (fragrance_id) => get().notes[fragrance_id] ?? null,

      search: (query) => {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        return Object.values(get().notes).filter(
          (n) =>
            n.body.toLowerCase().includes(q) ||
            n.social_notes.toLowerCase().includes(q) ||
            n.layering_logs.some(
              (l) => l.note.toLowerCase().includes(q) || l.paired_fragrance_name.toLowerCase().includes(q),
            ),
        );
      },
    }),
    {
      name: STORAGE_KEYS.fragranceNotes,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ notes: s.notes }),
    },
  ),
);
