// Site-wide constants. Single source of truth for the Astro site.
// Update these as the project evolves; everything else (schema, footer,
// social cards, llms.txt) reads from here.

export const SITE = {
  name: 'Perfume Picks',
  tagline: 'The Fragrance Collector\u2019s Wardrobe',
  description:
    'Perfume Picks is an iOS app for fragrance collectors. Catalog your wardrobe, track every wear, get weather and occasion-aware picks from bottles you already own, and see a personal taste profile built from your collection.',
  url: 'https://perfumepicks.app',
  locale: 'en-US',
  supportEmail: 'support@perfumepicks.app',
  // Set when the App Store listing is live. Until then, /download routes to a
  // \u201Ccoming soon\u201D state.
  appStoreUrl: '', // e.g. 'https://apps.apple.com/app/perfume-picks/id0000000000'
  bundleId: 'com.bobguillow.perfumepicks',
  appleTeamId: 'ZNS5TNLB2D',
  // Founder / publisher \u2014 used for Person and Organization schema. The
  // /about page is the canonical entity anchor.
  founder: {
    name: 'Bob Guillow',
    role: 'Founder',
    sameAs: [
      // Add LinkedIn / X / GitHub when ready. Empty entries are filtered out
      // before rendering so it\u2019s safe to leave them blank.
      // 'https://www.linkedin.com/in/...',
      // 'https://x.com/...',
    ],
  },
  // Analytics + tracking. All values come from env vars at build time so
  // local builds and forks don't fire analytics.
  analytics: {
    ga4Id: import.meta.env.PUBLIC_GA4_ID ?? '',
    gscVerification: import.meta.env.PUBLIC_GSC_VERIFICATION ?? '',
    indexNowKey: import.meta.env.PUBLIC_INDEXNOW_KEY ?? '',
  },
  // Brand colors \u2014 ivory / champagne gold / blush. Mirrors the in-app
  // palette in src/constants/theme.ts. The luxury fragrance category trades
  // in light backgrounds (Sephora, Nordstrom, every brand site).
  theme: {
    bg: '#FAF6F0',      // warm ivory
    card: '#FFFFFF',
    text: '#2A1F18',    // ink brown
    muted: '#7A6A5C',   // taupe
    accent: '#B8924B',  // champagne gold
    border: '#E6DCCB',
  },
};

export const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'Blog', href: '/articles' },
  { label: 'About', href: '/about' },
  { label: 'Support', href: '/support' },
];

export const FOOTER_NAV = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Delete Account', href: '/delete-account' },
];
