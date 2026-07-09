import {
  AXIS_NORMS,
  CATALOG_AXES,
  USER_RELATIVE_AXES,
  axisPercentile,
  type CatalogAxis,
} from '@/src/features/dna/axisNorms';

// DNA V3 M0 — sanity gates on the generated catalog-wide axis norms
// (regenerated via `node scripts/build-axis-norms.mjs`). If these fail after a
// regeneration, the catalog data (or the generator) drifted — investigate
// before shipping.

describe('axisNorms (generated)', () => {
  it('covers every catalog-derived axis (12 of the 14 DNA axes)', () => {
    expect(CATALOG_AXES).toEqual([
      'warmth',
      'sweetness',
      'florality',
      'presence',
      'luxury',
      'adventurousness',
      'era',
      'greenness',
      'darkness',
      'spice',
      'value',
      'genderLean',
    ]);
    for (const axis of CATALOG_AXES) {
      expect(AXIS_NORMS[axis]).toBeDefined();
    }
  });

  it('documents breadth + loyalty as user-relative (no catalog norm)', () => {
    expect(USER_RELATIVE_AXES).toEqual(['breadth', 'loyalty']);
    expect(CATALOG_AXES.length + USER_RELATIVE_AXES.length).toBe(14);
  });

  it.each(CATALOG_AXES.map((a) => [a] as [CatalogAxis]))(
    '%s: percentile table is 101 points, in [0,1], monotonic non-decreasing',
    (axis) => {
      const norm = AXIS_NORMS[axis];
      expect(norm.quantiles).toHaveLength(101);
      expect(norm.quantiles[0]).toBe(0);
      expect(norm.quantiles[100]).toBe(1);
      for (let i = 0; i < norm.quantiles.length; i++) {
        const q = norm.quantiles[i];
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(1);
        if (i > 0) expect(q).toBeGreaterThanOrEqual(norm.quantiles[i - 1]);
      }
    },
  );

  it.each(CATALOG_AXES.map((a) => [a] as [CatalogAxis]))(
    '%s: sample size and raw range are sane',
    (axis) => {
      const norm = AXIS_NORMS[axis];
      expect(norm.n).toBeGreaterThan(100); // every axis has real catalog support
      expect(Number.isFinite(norm.min)).toBe(true);
      expect(Number.isFinite(norm.max)).toBe(true);
      expect(norm.max).toBeGreaterThan(norm.min);
    },
  );

  it('era norms span a plausible fragrance-history range', () => {
    expect(AXIS_NORMS.era.min).toBeGreaterThanOrEqual(1800);
    expect(AXIS_NORMS.era.max).toBeLessThanOrEqual(new Date().getFullYear() + 1);
  });

  it('presence norms sit inside the 1-5 community scale', () => {
    expect(AXIS_NORMS.presence.min).toBeGreaterThanOrEqual(1);
    expect(AXIS_NORMS.presence.max).toBeLessThanOrEqual(5);
  });

  describe('axisPercentile()', () => {
    it.each(CATALOG_AXES.map((a) => [a] as [CatalogAxis]))(
      '%s: returns [0,1], clamps out-of-range, and is monotonic in raw score',
      (axis) => {
        const { min, max } = AXIS_NORMS[axis];
        // out-of-range raw scores clamp to the observed range
        expect(axisPercentile(axis, min - 1000)).toBe(axisPercentile(axis, min));
        expect(axisPercentile(axis, max + 1000)).toBe(axisPercentile(axis, max));
        const span = max - min;
        let prev = -1;
        for (let i = 0; i <= 20; i++) {
          const p = axisPercentile(axis, min + (span * i) / 20);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
          expect(p).toBeGreaterThanOrEqual(prev);
          prev = p;
        }
      },
    );

    it('spreads a low-tie-density axis (era) across the scale', () => {
      // era values are near-unique years, so min/max sit at the extremes
      expect(axisPercentile('era', AXIS_NORMS.era.min)).toBeLessThan(0.05);
      expect(axisPercentile('era', AXIS_NORMS.era.max)).toBeGreaterThan(0.95);
      const mid = axisPercentile('era', 2005);
      expect(mid).toBeGreaterThan(0.05);
      expect(mid).toBeLessThan(0.95);
    });

    it('uses mean rank for heavy ties (darkness=0 sits mid-block, not at 0 or 1)', () => {
      // a large share of the catalog has zero dark accords — a zero-darkness
      // bottle must land at the middle of that tied mass
      const p = axisPercentile('darkness', 0);
      expect(p).toBeGreaterThan(0.05);
      expect(p).toBeLessThan(0.75);
    });
  });
});
