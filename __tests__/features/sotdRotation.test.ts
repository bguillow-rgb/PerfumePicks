import { shownPenalty, selectSmartSotd, sotdDaySeed } from '@/src/features/recommend/smartSotd';

/**
 * Regression: the SOTD showed one user the SAME bottle for a week straight with 37
 * bottles in their wardrobe.
 *
 * Cause: rotation depended on wear recency, but almost nobody logs wears, so every
 * bottle read "never worn" and got an identical bonus. The ranking collapsed to a
 * static fit score, and the ±0.02 day jitter could not reorder a real score gap —
 * so the best-fitting bottle won every day forever.
 *
 * These tests pin the fix: rotation now runs on what was SHOWN (which needs no
 * user action), while the pick stays locked within a day.
 */

const mkFrag = (id: string, name: string): any => ({
  id,
  name,
  brand: 'Test',
  top_notes: [],
  heart_notes: [],
  base_notes: [],
  top_accords: ['floral'],
  accord_intensity: {},
  fragrance_family: 'floral',
  gender: 'unisex',
  community_longevity: 3,
  community_sillage: 3,
  community_projection: 3,
  compliment_score: 0.5,
  versatility_score: 0.5,
  office_safe_score: 0.5,
  price_tier: 3,
});

const profile: any = {
  liked_notes: {},
  disliked_notes: {},
  preferred_accords: {},
  preferred_families: {},
  avg_price_tier: 3,
  longevity_preference: 3,
  signal_count: 0,
};

describe('shownPenalty', () => {
  const shown = [{ fragranceId: 'a', date: '2026-07-17' }]; // yesterday

  it('demotes a bottle shown yesterday', () => {
    expect(shownPenalty('a', shown, '2026-07-18')).toBeLessThan(0);
  });

  it('leaves a bottle that was never shown alone', () => {
    expect(shownPenalty('b', shown, '2026-07-18')).toBe(0);
  });

  it('IGNORES today\'s own entry, so the pick stays locked within the day', () => {
    // Today's pick is recorded the moment it renders; penalizing it would knock it
    // off its own slot on the next re-render.
    const today = [{ fragranceId: 'a', date: '2026-07-18' }];
    expect(shownPenalty('a', today, '2026-07-18')).toBe(0);
  });

  it('decays to zero after a week, so a favorite comes back', () => {
    const old = [{ fragranceId: 'a', date: '2026-07-01' }];
    expect(shownPenalty('a', old, '2026-07-18')).toBe(0);
  });

  it('is stronger than the day jitter, so it can actually reorder a real gap', () => {
    // The old bug: jitter was ±0.02 and could never overcome a fit-score gap.
    expect(Math.abs(shownPenalty('a', shown, '2026-07-18'))).toBeGreaterThan(0.04);
  });
});

describe('selectSmartSotd rotation', () => {
  const candidates = [mkFrag('a', 'Alpha'), mkFrag('b', 'Bravo'), mkFrag('c', 'Charlie')];
  const ctx: any = { season: 'summer', occasion: 'casual' };
  const empty = new Map<string, string>();

  it('does not repeat yesterday\'s pick', () => {
    const day1 = sotdDaySeed('u1', new Date('2026-07-17T12:00:00Z'));
    const first = selectSmartSotd(candidates, profile, ctx, empty, day1, null, 3, false, [])[0];

    // Day 2, with day 1's hero recorded as shown.
    const day2 = sotdDaySeed('u1', new Date('2026-07-18T12:00:00Z'));
    const shown = [{ fragranceId: first.fragrance.id, date: day1.split('|')[1] }];
    const second = selectSmartSotd(candidates, profile, ctx, empty, day2, null, 3, false, shown)[0];

    expect(second.fragrance.id).not.toBe(first.fragrance.id);
  });

  it('stays stable within the same day even after today\'s pick is recorded', () => {
    const day = sotdDaySeed('u1', new Date('2026-07-18T12:00:00Z'));
    const first = selectSmartSotd(candidates, profile, ctx, empty, day, null, 3, false, [])[0];
    // Simulate the record-on-render effect, then recompute.
    const shown = [{ fragranceId: first.fragrance.id, date: day.split('|')[1] }];
    const again = selectSmartSotd(candidates, profile, ctx, empty, day, null, 3, false, shown)[0];

    expect(again.fragrance.id).toBe(first.fragrance.id);
  });
});
