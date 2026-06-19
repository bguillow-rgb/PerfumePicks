import { routeDnaCta, ctaForKind, DEFAULT_DNA_CTA } from '@/src/features/dna/ctaRouting';
import { TRAIT_KEYS, type TraitValues } from '@/src/features/dna/types';

/** Build a full TraitValues (all keys present) from a sparse override. */
function values(overrides: Partial<TraitValues>): TraitValues {
  const base = Object.fromEntries(TRAIT_KEYS.map((k) => [k, null])) as TraitValues;
  return { ...base, ...overrides };
}

describe('routeDnaCta — trait-routed monetization CTA (M6)', () => {
  it('routes the value-hunter to the Dupe Meter', () => {
    expect(routeDnaCta(values({ valueHunter: 0.9 })).kind).toBe('dupe');
  });

  it('routes the luxury buyer to the Original', () => {
    expect(routeDnaCta(values({ luxury: 0.8 })).kind).toBe('original');
  });

  it('routes the adventurous explorer to the $6 Sample', () => {
    expect(routeDnaCta(values({ adventurous: 0.7 })).kind).toBe('sample');
  });

  it('lets the STRONGEST routing trait win when several are present', () => {
    // luxury edges out valueHunter → original.
    expect(routeDnaCta(values({ luxury: 0.9, valueHunter: 0.4, adventurous: 0.2 })).kind).toBe('original');
    // valueHunter edges out luxury → dupe.
    expect(routeDnaCta(values({ luxury: 0.3, valueHunter: 0.95 })).kind).toBe('dupe');
  });

  it('falls through non-routing traits to the next routing trait', () => {
    // collector is strongest but is a taste trait (no route) → falls to valueHunter.
    expect(routeDnaCta(values({ collector: 0.99, valueHunter: 0.5 })).kind).toBe('dupe');
  });

  it('defaults to the lowest-commitment Sample when no routing trait scored', () => {
    expect(routeDnaCta(values({ collector: 0.8, complimentSeeking: 0.6, expressive: 0.4 }))).toEqual(DEFAULT_DNA_CTA);
    expect(routeDnaCta(values({})).kind).toBe('sample');
  });

  it('ignores zero / null trait values (only > 0 routes)', () => {
    expect(routeDnaCta(values({ valueHunter: 0, luxury: 0.5 })).kind).toBe('original');
  });

  it('every CTA carries a non-empty label and sub', () => {
    for (const v of [{ valueHunter: 0.9 }, { luxury: 0.9 }, { adventurous: 0.9 }, {}]) {
      const cta = routeDnaCta(values(v));
      expect(cta.label.length).toBeGreaterThan(0);
      expect(cta.sub.length).toBeGreaterThan(0);
    }
  });
});

describe('ctaForKind — explicit intent passthrough', () => {
  it('maps each kind to the matching CTA copy', () => {
    expect(ctaForKind('dupe').kind).toBe('dupe');
    expect(ctaForKind('original').kind).toBe('original');
    expect(ctaForKind('sample').kind).toBe('sample');
  });

  it('agrees with routeDnaCta for the canonical trait of each kind', () => {
    expect(ctaForKind('dupe')).toEqual(routeDnaCta(values({ valueHunter: 1 })));
    expect(ctaForKind('original')).toEqual(routeDnaCta(values({ luxury: 1 })));
    expect(ctaForKind('sample')).toEqual(routeDnaCta(values({ adventurous: 1 })));
  });
});
