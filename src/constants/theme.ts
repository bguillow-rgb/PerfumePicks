import { Platform } from 'react-native';

/**
 * Perfume Picks — feminine luxury design tokens.
 *
 * Palette inspired by:
 *   - Ivory paper / champagne gold / soft rose petal
 *   - Boutique fragrance counters (Diptyque, MFK, Le Labo)
 *   - Editorial fashion (Vogue, Town & Country)
 *
 * Locked v1. Do not iterate post-design-spec — paywall pricing, palette, and
 * typography were all sources of late-stage churn in StickPicks.
 */

export const COLORS = {
  // Surfaces — warm ivory/parchment, NOT dark mode. The luxury fragrance
  // category overwhelmingly trades in light backgrounds (Sephora, Nordstrom,
  // every brand site). Going dark would feel masculine + apothecary; we want
  // editorial + boutique.
  bg: '#FAF6F0',         // warm ivory
  card: '#FFFFFF',       // pure white card on ivory bg
  card2: '#F3ECE2',      // toasted parchment
  border: '#E6DCCB',     // warm dust

  // Text — softened black with warm undertone, never pure #000
  text: '#2A1F18',       // ink brown
  muted: '#7A6A5C',      // taupe
  subtle: '#A89684',     // dusty almond

  // Accent — champagne gold (the wordmark + CTAs)
  accent: '#B8924B',     // muted champagne — refined, not blingy
  accentDim: '#8E6E36',
  accentSoft: '#D4B179',

  // Secondary accent — blush, used sparingly for tags/badges
  blush: '#D9A6A0',
  blushSoft: '#F0D7D2',

  // Tertiary — deep burgundy for emphasis (limited use)
  burgundy: '#5C2A2A',

  // Semantic
  danger: '#A8443A',
  success: '#6B8E5A',
  warning: '#C68B3B',
  info: '#7B92B0',

  // Utility
  overlay: 'rgba(42,31,24,0.55)',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/**
 * Typography hierarchy:
 *   - 'Wordmark'  — Pinyon Script (cursive). Splash screen + section flourishes only.
 *   - 'Cormorant' — Cormorant Garamond (serif). Display headings, fragrance names.
 *   - System sans — body copy, UI labels, metadata.
 *
 * Cormorant is already loaded for StickPicks; reuse. Pinyon Script is the new
 * cursive wordmark font (drop PinyonScript-Regular.ttf in assets/fonts/).
 */
export const FONTS = {
  wordmark: 'Wordmark',
  serif: 'Cormorant',
  serifItalic: 'Cormorant-Italic',
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
} as const;

export const TYPE = {
  // Cursive wordmark — splash + occasional flourish only
  wordmark: {
    fontFamily: FONTS.wordmark,
    fontSize: 44,
    color: COLORS.accent,
  },
  // Serif display — fragrance names, screen titles
  displayLarge: {
    fontFamily: FONTS.serif,
    fontSize: 32,
    fontWeight: '600' as const,
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  displayMedium: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    fontWeight: '600' as const,
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  heading: {
    fontFamily: FONTS.serif,
    fontSize: 19,
    fontWeight: '600' as const,
    color: COLORS.text,
  },
  // Sans body — readable UI text, not serif (Cormorant at body sizes is
  // beautiful but harms scannability for lists).
  body: {
    fontFamily: FONTS.body,
    fontSize: 16,
    fontWeight: '400' as const,
    color: COLORS.text,
    lineHeight: 23,
  },
  bodySmall: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '400' as const,
    color: COLORS.muted,
    lineHeight: 20,
  },
  caption: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '500' as const,
    color: COLORS.subtle,
    letterSpacing: 0.4,
  },
  // Editorial all-caps label — used for section headers ("WARDROBE", "DAILY PICKS")
  eyebrow: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '600' as const,
    color: COLORS.accent,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
  },
  label: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    color: COLORS.text,
  },
} as const;
