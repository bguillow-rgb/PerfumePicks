import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import type { Fragrance } from '@/src/stores/useCatalogStore';

/**
 * User-added ("custom") fragrances. These live entirely on-device and are
 * NEVER in the global Supabase catalog — they exist so a user's wardrobe can
 * be complete even when their niche bottle isn't in our DB (PRD §7.8).
 *
 * Persisted to AsyncStorage so a custom bottle (and its scan photo path)
 * survives app restarts — fixing the bug where the detail screen went blank
 * for a custom `fragrance_id` after a cold start.
 *
 * IDs are prefixed `custom-` so the rest of the app can cheaply distinguish a
 * user entry from a catalog slug.
 */

export const CUSTOM_ID_PREFIX = 'custom-';

export function isCustomFragranceId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX);
}

/** Minimal fields a manual/scan add needs; the rest get neutral defaults. */
export interface CustomFragranceInput {
  name: string;
  brand?: string;
  image_url?: string;
  concentration?: Fragrance['concentration'];
  gender?: Fragrance['gender'];
  release_year?: number;
}

interface CustomFragranceState {
  items: Record<string, Fragrance>;
  add: (input: CustomFragranceInput) => Fragrance;
  getById: (id: string) => Fragrance | undefined;
  all: () => Fragrance[];
  remove: (id: string) => void;
}

function buildFragrance(input: CustomFragranceInput): Fragrance {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: `${CUSTOM_ID_PREFIX}${slug}-${Crypto.randomUUID().slice(0, 8)}`,
    brand: input.brand?.trim() || 'Unknown',
    name: input.name.trim(),
    concentration: input.concentration ?? 'edp',
    fragrance_family: 'floral',
    gender: input.gender ?? 'unisex',
    top_notes: [], heart_notes: [], base_notes: [],
    top_accords: [], accord_intensity: {},
    community_longevity: 3, community_sillage: 3, community_projection: 3,
    compliment_score: 0.5, versatility_score: 0.5, office_safe_score: 0.5,
    price_tier: 3, retail_msrp_usd_cents: 0,
    image_url: input.image_url ?? '',
    similar_ids: [], dupe_of: null,
    release_year: input.release_year ?? new Date().getFullYear(),
  };
}

export const useCustomFragranceStore = create<CustomFragranceState>()(
  persist(
    (set, get) => ({
      items: {},

      add: (input) => {
        const frag = buildFragrance(input);
        set((s) => ({ items: { ...s.items, [frag.id]: frag } }));
        return frag;
      },

      getById: (id) => get().items[id],

      all: () => Object.values(get().items),

      remove: (id) => set((s) => {
        const { [id]: _, ...rest } = s.items;
        return { items: rest };
      }),
    }),
    {
      name: STORAGE_KEYS.customFragrances,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
