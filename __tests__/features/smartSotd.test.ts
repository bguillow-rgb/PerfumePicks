import {
  selectSmartSotd,
  seededJitter,
  sotdDaySeed,
  sotdReason,
} from '@/src/features/recommend/smartSotd';
import { EMPTY_TASTE_PROFILE, type DerivedTasteProfile } from '@/src/features/recommend/tasteProfile';
import type { Fragrance } from '@/src/stores/useCatalogStore';
import type { RecContext } from '@/src/features/recommend/score';

let seq = 0;
function frag(over: Partial<Fragrance> = {}): Fragrance {
  return {
    id: `f${seq++}`,
    fragrance_family: 'woody',
    gender: 'masculine',
    top_notes: ['bergamot'],
    heart_notes: ['lavender'],
    base_notes: ['cedar'],
    top_accords: ['woody'],
    accord_intensity: { woody: 4 },
    community_longevity: 4,
    community_sillage: 3,
    community_projection: 3,
    compliment_score: 0.6,
    versatility_score: 0.6,
    office_safe_score: 0.6,
    price_tier: 3,
    ...over,
  } as unknown as Fragrance;
}

const profile: DerivedTasteProfile = { ...EMPTY_TASTE_PROFILE };
const ctx: RecContext = { season: 'summer', occasion: 'casual' };

describe('smart SOTD — determinism (the day-stability fix)', () => {
  it('is stable for the same (candidates, day seed) across calls', () => {
    seq = 0;
    const cands = [frag(), frag(), frag(), frag(), frag()];
    const seed = 'user-123|2026-07-04';
    const a = selectSmartSotd(cands, profile, ctx, new Map(), seed, null, 3, false);
    const b = selectSmartSotd(cands, profile, ctx, new Map(), seed, null, 3, false);
    expect(a.map((p) => p.fragrance.id)).toEqual(b.map((p) => p.fragrance.id));
  });

  it('seededJitter is deterministic and bounded to ±scale/2', () => {
    const j1 = seededJitter('abc', 'seed', 0.04);
    const j2 = seededJitter('abc', 'seed', 0.04);
    expect(j1).toBe(j2);
    expect(Math.abs(j1)).toBeLessThanOrEqual(0.02 + 1e-9);
    expect(seededJitter('abc', 'seed', 0.04)).not.toBe(seededJitter('xyz', 'seed', 0.04));
  });

  it('rotates across days: a different day seed can reorder ties without crashing', () => {
    seq = 0;
    const cands = [frag(), frag(), frag(), frag(), frag()];
    const d1 = selectSmartSotd(cands, profile, ctx, new Map(), 'u|2026-07-04', null, 3, false);
    const d2 = selectSmartSotd(cands, profile, ctx, new Map(), 'u|2026-07-05', null, 3, false);
    expect(d1).toHaveLength(3);
    expect(d2).toHaveLength(3);
    // Every returned pick is a real candidate.
    const ids = new Set(cands.map((c) => c.id));
    expect(d1.every((p) => ids.has(p.fragrance.id))).toBe(true);
  });

  it('returns [] for an empty wardrobe (never throws)', () => {
    expect(selectSmartSotd([], profile, ctx, new Map(), 'u|d', null, 3, false)).toEqual([]);
  });
});

describe('smart SOTD — narration honesty (no fake recency for non-loggers)', () => {
  it('does NOT use "never worn" recency when the user does not log wears', () => {
    const f = frag();
    // hasWearSignal = false, no last-worn: must not claim anything about wearing.
    const r = sotdReason(f, ctx, null, null, 'a thoughtful pick for today', false).toLowerCase();
    expect(r).not.toContain('worn');
    expect(r).not.toContain('rotation');
  });

  it('does NOT use "last worn" recency when the user does not log wears', () => {
    const f = frag();
    const old = new Date(Date.now() - 60 * 86400_000).toISOString();
    const r = sotdReason(f, ctx, null, old, 'a thoughtful pick for today', false).toLowerCase();
    expect(r).not.toContain('weeks');
    expect(r).not.toContain('logged');
  });

  it('DOES use overdue recency when the user logs wears (hasWearSignal=true)', () => {
    const f = frag();
    const old = new Date(Date.now() - 60 * 86400_000).toISOString();
    const r = sotdReason(f, ctx, null, old, 'a thoughtful pick for today', true).toLowerCase();
    expect(r).toContain('weeks');
  });

  it('prefers the specific taste base reason over recency', () => {
    const f = frag();
    const old = new Date(Date.now() - 60 * 86400_000).toISOString();
    // Even a logger with an overdue bottle: a specific base reason wins.
    const r = sotdReason(f, ctx, null, old, 'tracks with the woody accord you favor', true);
    expect(r).toBe('tracks with the woody accord you favor');
  });

  it('recency is never the top reason when weather/occasion fit', () => {
    const f = frag({ office_safe_score: 0.9 });
    const r = sotdReason(f, { occasion: 'office' }, null, null, 'a thoughtful pick for today', true).toLowerCase();
    expect(r).toContain('office');
  });
});

describe('sotdDaySeed', () => {
  it('encodes user + local date and is stable within a day', () => {
    const now = new Date('2026-07-04T12:00:00Z');
    expect(sotdDaySeed('u1', now)).toBe(sotdDaySeed('u1', now));
    expect(sotdDaySeed('u1', now)).not.toBe(sotdDaySeed('u2', now));
  });
});
