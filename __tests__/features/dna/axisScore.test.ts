/**
 * M1 — per-bottle raw axis scores (axisScore.ts, the canonical formula module
 * mirrored by scripts/build-axis-norms.mjs). Covers every formula, the
 * accord-weight fallback chain, msrp imputation, and the NULL-skip contract
 * (a bottle missing an axis's fields scores `null`, never a fake neutral).
 */

import {
  accordWeights,
  axisPercentileOf,
  luxuryRaw,
  LUXURY_TIER_MEDIAN_CENTS,
  rawAxisScore,
} from '@/src/features/dna/axisScore';
import { axisPercentile, CATALOG_AXES } from '@/src/features/dna/axisNorms';
import type { DnaCatalogFragrance } from '@/src/features/dna/types';

let seq = 0;
function frag(over: Partial<DnaCatalogFragrance> = {}): DnaCatalogFragrance {
  return {
    id: `f${seq++}`,
    fragrance_family: 'woody',
    gender: 'masculine',
    top_notes: [],
    heart_notes: [],
    base_notes: [],
    top_accords: ['woody'],
    accord_intensity: { woody: 4 },
    community_longevity: 4,
    community_sillage: 3,
    community_projection: 3,
    compliment_score: 0.5,
    versatility_score: 0.5,
    office_safe_score: 0.5,
    price_tier: 3,
    retail_msrp_usd_cents: 12000,
    popularity_tier: 4,
    release_year: 2015,
    dupe_of: null,
    ...over,
  };
}

describe('accordWeights', () => {
  it('prefers accord_intensity values when present', () => {
    const w = accordWeights(frag({ accord_intensity: { Amber: 5, spicy: 2 }, top_accords: ['woody'] }));
    expect(w).toEqual({ amber: 5, spicy: 2 }); // normalized keys, top_accords ignored
  });

  it('falls back to top_accords positions (4, 3.5, 3… floor 1)', () => {
    const w = accordWeights(
      frag({ accord_intensity: {}, top_accords: ['amber', 'spicy', 'woody', 'a', 'b', 'c', 'd', 'e'] }),
    );
    expect(w!.amber).toBe(4);
    expect(w!.spicy).toBe(3.5);
    expect(w!.woody).toBe(3);
    expect(w!.e).toBe(1); // floor
  });

  it('returns null when the bottle has no accord data at all', () => {
    expect(accordWeights(frag({ accord_intensity: {}, top_accords: [] }))).toBeNull();
  });
});

describe('rawAxisScore formulas', () => {
  it('warmth = warm accords minus fresh accords', () => {
    const f = frag({ accord_intensity: { amber: 4, vanilla: 2, citrus: 3 } });
    expect(rawAxisScore('warmth', f)).toBe(4 + 2 - 3);
  });

  it('sweetness adds +2 for the gourmand family', () => {
    const base = frag({ accord_intensity: { sweet: 3, vanilla: 1 } });
    expect(rawAxisScore('sweetness', base)).toBe(4);
    expect(rawAxisScore('sweetness', { ...base, fragrance_family: 'gourmand' })).toBe(6);
  });

  it('florality adds +2 for the floral family', () => {
    const f = frag({ accord_intensity: { rose: 3, powdery: 2 }, fragrance_family: 'floral' });
    expect(rawAxisScore('florality', f)).toBe(3 + 2 + 2);
  });

  it('presence = mean of projection, sillage, and mean accord intensity', () => {
    const f = frag({
      community_projection: 4,
      community_sillage: 2,
      accord_intensity: { woody: 3, amber: 5 }, // mean 4
    });
    expect(rawAxisScore('presence', f)).toBeCloseTo((4 + 2 + 4) / 3);
  });

  it('adventurousness = 6 − popularity_tier; era = release_year', () => {
    const f = frag({ popularity_tier: 2, release_year: 1998 });
    expect(rawAxisScore('adventurousness', f)).toBe(4);
    expect(rawAxisScore('era', f)).toBe(1998);
  });

  it('greenness / darkness / spice sum their keyword sets', () => {
    const f = frag({ accord_intensity: { green: 2, earthy: 1, oud: 3, smoky: 2, spicy: 4, 'warm-spicy': 1 } });
    expect(rawAxisScore('greenness', f)).toBe(3);
    expect(rawAxisScore('darkness', f)).toBe(5);
    expect(rawAxisScore('spice', f)).toBe(5);
  });

  it('value = (1 − luxury percentile) × versatility_score', () => {
    const f = frag({ retail_msrp_usd_cents: 12000, versatility_score: 0.8 });
    const expected = (1 - axisPercentile('luxury', 12000)) * 0.8;
    expect(rawAxisScore('value', f)).toBeCloseTo(expected);
  });

  it('genderLean encodes masculine=0 / unisex=0.5 / feminine=1', () => {
    expect(rawAxisScore('genderLean', frag({ gender: 'masculine' }))).toBe(0);
    expect(rawAxisScore('genderLean', frag({ gender: 'unisex' }))).toBe(0.5);
    expect(rawAxisScore('genderLean', frag({ gender: 'feminine' }))).toBe(1);
  });
});

describe('luxury imputation', () => {
  it('uses retail msrp when present', () => {
    expect(luxuryRaw(frag({ retail_msrp_usd_cents: 9900 }))).toBe(9900);
  });

  it('imputes the tier median when msrp is missing', () => {
    const f = frag({ retail_msrp_usd_cents: null as unknown as number, price_tier: 4 });
    expect(luxuryRaw(f)).toBe(LUXURY_TIER_MEDIAN_CENTS[4]);
  });

  it('returns null when neither msrp nor tier exists', () => {
    const f = frag({
      retail_msrp_usd_cents: null as unknown as number,
      price_tier: null as unknown as number,
    });
    expect(luxuryRaw(f)).toBeNull();
  });
});

describe('NULL-skip contract (residual pool NULLs)', () => {
  it('era is null when release_year is missing', () => {
    expect(rawAxisScore('era', frag({ release_year: undefined }))).toBeNull();
  });

  it('presence is null when projection/sillage/intensity are all missing', () => {
    const f = frag({
      community_projection: null as unknown as number,
      community_sillage: null as unknown as number,
      accord_intensity: {},
    });
    expect(rawAxisScore('presence', f)).toBeNull();
  });

  it('accord axes are null without accord data', () => {
    const f = frag({ accord_intensity: {}, top_accords: [] });
    for (const axis of ['warmth', 'sweetness', 'florality', 'greenness', 'darkness', 'spice'] as const) {
      expect(rawAxisScore(axis, f)).toBeNull();
    }
  });

  it('adventurousness is null without popularity_tier', () => {
    expect(rawAxisScore('adventurousness', frag({ popularity_tier: undefined }))).toBeNull();
  });
});

describe('axisPercentileOf', () => {
  it('maps every scorable axis into [0,1] and nulls stay null', () => {
    const full = frag();
    for (const axis of CATALOG_AXES) {
      const p = axisPercentileOf(axis, full);
      expect(p).not.toBeNull();
      expect(p!).toBeGreaterThanOrEqual(0);
      expect(p!).toBeLessThanOrEqual(1);
    }
    expect(axisPercentileOf('era', frag({ release_year: undefined }))).toBeNull();
  });
});
