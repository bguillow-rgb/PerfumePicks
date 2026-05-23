import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type BadgeKey =
  | 'streak_7' | 'streak_30' | 'streak_100' | 'streak_365'
  | 'collector_10' | 'collector_50'
  | 'first_wear' | 'first_review';

export interface Badge {
  key: BadgeKey;
  awarded_at: string;
}

export const BADGE_META: Record<BadgeKey, { label: string; icon: string; description: string }> = {
  streak_7:     { label: '7-Day Streak',    icon: '🔥', description: 'Logged a wear 7 days in a row' },
  streak_30:    { label: '30-Day Streak',   icon: '🔥', description: 'Logged a wear 30 days in a row' },
  streak_100:   { label: '100-Day Streak',  icon: '🏆', description: 'Logged a wear 100 days in a row' },
  streak_365:   { label: 'Year of Scent',   icon: '👑', description: 'Logged a wear every day for a year' },
  collector_10: { label: 'Collector',       icon: '🧴', description: '10 fragrances in your wardrobe' },
  collector_50: { label: 'Connoisseur',     icon: '💎', description: '50 fragrances in your wardrobe' },
  first_wear:   { label: 'First Wear',      icon: '📅', description: 'Logged your first wear' },
  first_review: { label: 'Critic',          icon: '✍️', description: 'Wrote your first review' },
};

interface BadgesState {
  earned: Badge[];
  /** Called from useAppSync or profile on mount — merges server awards. */
  hydrate: (rows: Badge[]) => void;
  /** Award locally (idempotent). Used for instant gratification before server confirms. */
  award: (key: BadgeKey) => void;
  has: (key: BadgeKey) => boolean;
}

export const useBadgesStore = create<BadgesState>()(
  persist(
    (set, get) => ({
      earned: [],

      hydrate: (rows) => {
        const existing = new Set(get().earned.map((b) => b.key));
        const merged = [...get().earned, ...rows.filter((r) => !existing.has(r.key))];
        set({ earned: merged });
      },

      award: (key) => {
        if (get().has(key)) return;
        set((s) => ({
          earned: [...s.earned, { key, awarded_at: new Date().toISOString() }],
        }));
      },

      has: (key) => get().earned.some((b) => b.key === key),
    }),
    {
      name: 'perfumepicks-badges',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ earned: s.earned }),
    },
  ),
);
