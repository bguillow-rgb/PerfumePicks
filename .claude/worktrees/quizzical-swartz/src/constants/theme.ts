import { Platform } from 'react-native';

export const COLORS = {
  // Surfaces — deep dark green-black, like a private club at night
  bg: '#0A1A0F',
  card: '#12261A',
  card2: '#1A3324',
  border: '#264D35',

  // Text
  text: '#F5F1E8',       // warm cream/parchment
  muted: '#A3B5A8',      // sage gray
  subtle: '#6B8A72',     // muted green

  // Accent — Masters gold
  accent: '#D4AF37',     // classic gold
  accentDim: '#9A7B1F',
  accentSoft: '#E8CC6A',

  // Semantic
  danger: '#D64545',
  success: '#3DA55D',
  warning: '#D4AF37',
  info: '#4A90D9',

  // Utility
  overlay: 'rgba(6,16,10,0.75)',
  white: '#FFFFFF',
  black: '#000000',

  // Premium green accents
  green: '#1B5E20',
  greenLight: '#2E7D32',
  greenDark: '#0D3B13',
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

export const FONTS = {
  display: 'Cormorant',
  body: 'Cormorant',
} as const;

export const TYPE = {
  displayLarge: {
    fontFamily: FONTS.display,
    fontSize: 28,
    fontWeight: '800' as const,
    color: COLORS.text,
  },
  displayMedium: {
    fontFamily: FONTS.display,
    fontSize: 22,
    fontWeight: '700' as const,
    color: COLORS.text,
  },
  heading: {
    fontFamily: FONTS.body,
    fontSize: 18,
    fontWeight: '700' as const,
    color: COLORS.text,
  },
  body: {
    fontFamily: FONTS.body,
    fontSize: 16,
    fontWeight: '400' as const,
    color: COLORS.text,
  },
  bodySmall: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '400' as const,
    color: COLORS.muted,
  },
  caption: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '500' as const,
    color: COLORS.subtle,
  },
  label: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    color: COLORS.text,
  },
} as const;
