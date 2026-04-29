/**
 * Central registry of all AsyncStorage persistence keys used by Zustand stores.
 *
 * Having keys in one place prevents copy-paste accidents (e.g. using a key
 * from another app) and makes key audits/migrations trivial.
 */
export const STORAGE_KEYS = {
  pro: 'perfumepicks-pro',
  profile: 'perfumepicks-profile',
  wardrobe: 'perfumepicks-wardrobe',
  swipes: 'perfumepicks-swipes',
  wearLog: 'perfumepicks-wearlog',
  quiz: 'perfumepicks-quiz',
  fragranceNotes: 'perfumepicks-fragrance-notes',
} as const;
