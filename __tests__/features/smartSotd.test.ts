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
    const a = selectSmartSotd(cands, profile, ctx, new Map(), seed, null, 3);
    const b = selectSmartSotd(cands, profile, ctx, new Map(), seed, null, 3);
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
    const d1 = selectSmartSotd(cands, profile, ctx, new Map(), 'u|2026-07-04', null, 3);
    const d2 = selectSmartSotd(cands, profile, ctx, new Map(), 'u|2026-07-05', null, 3);
    expect(d1).toHaveLength(3);
    expect(d2).toHaveLength(3);
    // Every returned pick is a real candidate.
    const ids = new Set(cands.map((c) => c.id));
    expect(d1.every((p) => ids.has(p.fragrance.id))).toBe(true);
  });

  it('returns [] for an empty wardrobe (never throws)', () => {
    expect(selectSmartSotd([], profile, ctx, new Map(), 'u|d', null, 3)).toEqual([]);
  });
});

describe('smart SOTD — rotation narration', () => {
  it('leads with never-worn when the bottle has no wear history', () => {
    const f = frag();
    const r = sotdReason(f, ctx, null, null, 'base');
    expect(r.toLowerCase()).toContain("haven't worn");
  });

  it('leads with overdue when it has been many weeks', () => {
    const f = frag();
    const old = new Date(Date.now() - 60 * 86400_000).toISOString();
    const r = sotdReason(f, ctx, null, old, 'base');
    expect(r.toLowerCase()).toContain('weeks');
  });

  it('falls back to the base reason when no stronger signal fires', () => {
    const f = frag();
    const recent = new Date(Date.now() - 3 * 86400_000).toISOString();
    const r = sotdReason(f, { occasion: 'casual' }, null, recent, 'BASE_REASON');
    expect(r).toBe('BASE_REASON');
  });
});

describe('sotdDaySeed', () => {
  it('encodes user + local date and is stable within a day', () => {
    const now = new Date('2026-07-04T12:00:00Z');
    expect(sotdDaySeed('u1', now)).toBe(sotdDaySeed('u1', now));
    expect(sotdDaySeed('u1', now)).not.toBe(sotdDaySeed('u2', now));
  });
});
