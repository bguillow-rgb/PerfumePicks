/**
 * M1 — the 14-axis user feature vector (axes.ts). Covers pick-weight
 * aggregation (favorites 2.5×, explicit pick.weight verbatim), the per-axis
 * NULL-skip, neutral fallbacks, and the user-relative breadth/loyalty axes
 * with their evidence damping.
 */

import { deriveAxes, familyEntropyBreadth, loyaltyRaw, NEUTRAL_AXIS } from '@/src/features/dna/axes';
import { axisPercentileOf } from '@/src/features/dna/axisScore';
import { CATALOG_AXES, USER_RELATIVE_AXES } from '@/src/features/dna/axisNorms';
import type { DnaCatalogFragrance, DnaPick } from '@/src/features/dna/types';

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
const pick = (f: DnaCatalogFragrance, over: Partial<DnaPick> = {}): DnaPick => ({
  fragrance: f,
  relation: 'like',
  favorite: false,
  ...over,
});

describe('deriveAxes — catalog axes', () => {
  it('returns all 14 axes in [0,1]', () => {
    const v = deriveAxes([pick(frag()), pick(frag({ fragrance_family: 'floral', gender: 'feminine' }))]);
    for (const axis of [...CATALOG_AXES, ...USER_RELATIVE_AXES]) {
      expect(v[axis]).toBeGreaterThanOrEqual(0);
      expect(v[axis]).toBeLessThanOrEqual(1);
    }
  });

  it('empty picks → every axis neutral 0.5', () => {
    const v = deriveAxes([]);
    for (const axis of [...CATALOG_AXES, ...USER_RELATIVE_AXES]) {
      expect(v[axis]).toBe(NEUTRAL_AXIS);
    }
  });

  it('single pick reproduces that bottle\'s axis percentiles exactly', () => {
    const f = frag({ accord_intensity: { amber: 5, vanilla: 3 } });
    const v = deriveAxes([pick(f)]);
    expect(v.warmth).toBeCloseTo(axisPercentileOf('warmth', f)!);
    expect(v.luxury).toBeCloseTo(axisPercentileOf('luxury', f)!);
  });

  it('a ⭐favorite weighs 2.5× a plain pick', () => {
    const warm = frag({ accord_intensity: { amber: 5, vanilla: 5 } });
    const fresh = frag({ accord_intensity: { citrus: 5, aquatic: 5 } });
    const pw = axisPercentileOf('warmth', warm)!;
    const pf = axisPercentileOf('warmth', fresh)!;
    const v = deriveAxes([pick(warm, { favorite: true }), pick(fresh)]);
    expect(v.warmth).toBeCloseTo((2.5 * pw + 1 * pf) / 3.5);
  });

  it('honors an explicit pick.weight verbatim (M4 search picks at 1.5×)', () => {
    const warm = frag({ accord_intensity: { amber: 5, vanilla: 5 } });
    const fresh = frag({ accord_intensity: { citrus: 5, aquatic: 5 } });
    const pw = axisPercentileOf('warmth', warm)!;
    const pf = axisPercentileOf('warmth', fresh)!;
    const v = deriveAxes([pick(warm, { weight: 1.5 }), pick(fresh)]);
    expect(v.warmth).toBeCloseTo((1.5 * pw + 1 * pf) / 2.5);
  });

  it('skips a pick on an axis its fields are NULL for, without polluting the mean', () => {
    const dated = frag({ release_year: 1990 });
    const undated = frag({ release_year: undefined }); // the residual-NULL pool bottle
    const solo = deriveAxes([pick(dated)]);
    const withNull = deriveAxes([pick(dated), pick(undated)]);
    expect(withNull.era).toBeCloseTo(solo.era); // undated contributed nothing to era
  });

  it('an axis NO pick can score resolves to neutral 0.5', () => {
    const undated = frag({ release_year: undefined });
    expect(deriveAxes([pick(undated)]).era).toBe(NEUTRAL_AXIS);
  });
});

describe('user-relative axes — breadth + loyalty', () => {
  it('breadth: one family reads 0, all-distinct families read 1', () => {
    const woody1 = frag({ fragrance_family: 'woody' });
    const woody2 = frag({ fragrance_family: 'woody' });
    const floral = frag({ fragrance_family: 'floral' });
    const amber = frag({ fragrance_family: 'amber' });
    expect(familyEntropyBreadth([pick(woody1), pick(woody2)])).toBe(0);
    expect(familyEntropyBreadth([pick(woody1), pick(floral), pick(amber)])).toBeCloseTo(1);
  });

  it('loyalty raw: tight one-family set reads high, favorite bumps it', () => {
    const woody1 = frag({ fragrance_family: 'woody', top_accords: ['woody'] });
    const woody2 = frag({ fragrance_family: 'woody', top_accords: ['woody'] });
    const plain = loyaltyRaw([pick(woody1), pick(woody2)]);
    const anchored = loyaltyRaw([pick(woody1, { favorite: true }), pick(woody2)]);
    expect(plain).toBeGreaterThan(0.5);
    expect(anchored).toBeGreaterThan(plain);
  });

  it('evidence damping: a single pick proves nothing → both axes neutral', () => {
    const v = deriveAxes([pick(frag())]);
    expect(v.breadth).toBe(NEUTRAL_AXIS);
    expect(v.loyalty).toBe(NEUTRAL_AXIS);
  });

  it('evidence damping ramps: 4+ picks carry full strength', () => {
    const fams = ['woody', 'floral', 'amber', 'fresh'];
    const wide = fams.map((fam) => pick(frag({ fragrance_family: fam })));
    const v = deriveAxes(wide);
    expect(v.breadth).toBeCloseTo(familyEntropyBreadth(wide)); // undamped
    expect(v.breadth).toBeGreaterThan(0.9);
  });

  it('is deterministic', () => {
    const picks = [pick(frag()), pick(frag({ fragrance_family: 'floral' }))];
    expect(deriveAxes(picks)).toEqual(deriveAxes(picks));
  });
});
