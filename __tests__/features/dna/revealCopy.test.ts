import { ARCHETYPE_COPY } from '@/src/features/dna/revealCopy';
import type { ArchetypeKey } from '@/src/features/dna/types';

// The full key roster — every persisted or electable key must ship complete
// copy + visual direction so no reveal can ever render undefined. 12 legacy
// keys + the 10 DNA V3 roster additions (V3 copy is placeholder until M3's
// authored pass, but must exist and be structurally complete NOW).
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
  // DNA V3 (M1)
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

describe('ARCHETYPE_COPY — all 22 archetype keys ship complete content', () => {
  it('covers every archetype with no extras', () => {
    expect(Object.keys(ARCHETYPE_COPY).sort()).toEqual([...ALL_ARCHETYPES].sort());
  });

  it.each(ALL_ARCHETYPES)('%s has a name, identity line, and visual direction', (key) => {
    const c = ARCHETYPE_COPY[key];
    expect(c.name).toMatch(/^The /);
    expect(c.identity.length).toBeGreaterThan(20);
    expect(typeof c.visual.icon).toBe('string');
    expect(c.visual.icon.length).toBeGreaterThan(0);
    // tint is a 6-digit hex so the emblem ring/accent renders.
    expect(c.visual.tint).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('gives each archetype a distinct signature hue (no templated reuse)', () => {
    const tints = ALL_ARCHETYPES.map((k) => ARCHETYPE_COPY[k].visual.tint.toLowerCase());
    expect(new Set(tints).size).toBe(tints.length);
  });
});
