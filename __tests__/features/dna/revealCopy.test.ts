import {
  ARCHETYPE_COPY,
  MODIFIER_COPY,
  dnaDisplayName,
  modifierWord,
} from '@/src/features/dna/revealCopy';
import { TRAIT_KEYS } from '@/src/features/dna/types';
import type { ArchetypeKey, TraitKey } from '@/src/features/dna/types';

// The real Ionicons glyph map — every reveal emblem must resolve to an actual
// glyph, or the emblem renders the "?"-box on device (tsc can't catch this;
// the icon prop is a string).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IONICONS_GLYPHS: Record<string, number> = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');

// The full key roster — every persisted or electable key must ship complete
// copy + visual direction so no reveal can ever render undefined. 10 kept +
// 10 DNA V3 additions (authored M3) + 2 persisted-only legacy keys
// (crowd_pleaser, rebel). ADDING AN ArchetypeKey WITHOUT COPY FAILS HERE
// (and fails tsc via the Record<ArchetypeKey, …> type first).
const ALL_ARCHETYPES: ArchetypeKey[] = [
  'the_executive',
  'the_seducer',
  'the_crowd_pleaser',
  'the_connoisseur',
  'the_signature_wearer',
  'the_purist',
  'the_showstopper',
  'the_smart_shopper',
  'the_romantic',
  'the_explorer',
  'the_classicist',
  'the_rebel',
  // DNA V3 (M1 keys, M3 authored copy)
  'the_gourmand',
  'the_minimalist',
  'the_naturalist',
  'the_trendsetter',
  'the_old_soul',
  'the_maximalist',
  'the_night_owl',
  'the_spice_trader',
  'the_daybreaker',
  'the_soft_focus',
];

// Bob's humanize gate, encoded: none of these may appear in an identity line.
const BANNED_WORDS = [
  'unlock',
  'discover',
  'elevate',
  'journey',
  'seamless',
  'effortless',
  'curated',
  'powerful',
  'personalized',
  'premium',
  'designed for you',
];

describe('ARCHETYPE_COPY — all 22 archetype keys ship complete content', () => {
  it('covers every archetype with no extras', () => {
    expect(Object.keys(ARCHETYPE_COPY).sort()).toEqual([...ALL_ARCHETYPES].sort());
  });

  it.each(ALL_ARCHETYPES)('%s has a name, identity line, and visual direction', (key) => {
    const c = ARCHETYPE_COPY[key];
    expect(c.name).toMatch(/^The /);
    expect(c.identity.length).toBeGreaterThan(20);
    expect(c.identity).not.toContain('TODO');
    expect(typeof c.visual.icon).toBe('string');
    expect(c.visual.icon.length).toBeGreaterThan(0);
    // tint is a 6-digit hex so the emblem ring/accent renders.
    expect(c.visual.tint).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it.each(ALL_ARCHETYPES)('%s icon exists in the Ionicons glyph map', (key) => {
    expect(IONICONS_GLYPHS[ARCHETYPE_COPY[key].visual.icon]).toBeDefined();
  });

  it('gives each archetype a distinct signature hue (no templated reuse)', () => {
    const tints = ALL_ARCHETYPES.map((k) => ARCHETYPE_COPY[k].visual.tint.toLowerCase());
    expect(new Set(tints).size).toBe(tints.length);
  });

  it.each(ALL_ARCHETYPES)('%s identity line passes the humanize gate', (key) => {
    const line = ARCHETYPE_COPY[key].identity.toLowerCase();
    for (const word of BANNED_WORDS) {
      expect(line).not.toContain(word);
    }
  });
});

describe('MODIFIER_COPY — every trait key ships a display word', () => {
  it('covers every TraitKey with no extras (future trait additions fail here)', () => {
    expect(Object.keys(MODIFIER_COPY).sort()).toEqual([...TRAIT_KEYS].sort());
  });

  it.each([...TRAIT_KEYS])('%s has a non-empty capitalized word', (key: TraitKey) => {
    expect(MODIFIER_COPY[key]).toMatch(/^[A-Z][A-Za-z-]+$/);
  });

  it('all six words are distinct', () => {
    const words = TRAIT_KEYS.map((k) => MODIFIER_COPY[k]);
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('modifierWord — persisted snake_case → display word', () => {
  it('resolves every snake_case trait key round-tripped from TRAIT_KEYS', () => {
    for (const k of TRAIT_KEYS) {
      const snake = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      expect(modifierWord(snake)).toBe(MODIFIER_COPY[k]);
    }
  });

  it('returns null for null/undefined/unknown modifiers', () => {
    expect(modifierWord(null)).toBeNull();
    expect(modifierWord(undefined)).toBeNull();
    expect(modifierWord('')).toBeNull();
    expect(modifierWord('some_future_trait')).toBeNull();
  });
});

describe('dnaDisplayName — the "The {Modifier} {Archetype}" fold', () => {
  it('folds the modifier word after "The"', () => {
    expect(dnaDisplayName('the_classicist', 'compliment_seeking')).toBe(
      'The Magnetic Classicist',
    );
    expect(dnaDisplayName('the_night_owl', 'luxury')).toBe('The Gilded Night Owl');
  });

  it('renders the plain name when the modifier is null or unknown', () => {
    expect(dnaDisplayName('the_seducer', null)).toBe('The Seducer');
    expect(dnaDisplayName('the_seducer')).toBe('The Seducer');
    expect(dnaDisplayName('the_seducer', 'not_a_trait')).toBe('The Seducer');
  });
});
