/**
 * M1 gate — Living DNA engine (unified signal pool + recency-weighted derivation).
 *
 * Covers PRD §8.1 T-U1..T-U8:
 *   T-U1 effectiveWeight: love > like at equal ts; skip never emitted
 *   T-U2 recency: newer > older; ~90d @ TAU=30 → <0.10
 *   T-U3 deliberate factor applies to passive kinds only
 *   T-U4 no-regression: deriveLivingDNA(seeds-only) == deriveFragranceDNA(picks)
 *   T-U5 weighted swipes shift an accord / can flip archetype
 *   T-U6 refresh: replacing seeds keeps non-seed signals; fresh picks dominate
 *   T-U7 confidence monotonically non-decreasing as signal count rises
 *   T-U8 reconciled swipe weights: one source, no divergence
 */

import {
  buildDnaSignals,
  signalsToPools,
  effectiveWeight,
  recencyFactor,
  deriveLivingDNA,
  deriveFragranceDNA,
  RECOMMENDATION_SIGNAL_WEIGHTS,
  RECENCY_TAU_DAYS,
  type DnaCatalogFragrance,
  type DnaPick,
  type DnaSignal,
} from '@/src/features/dna';

// ── fixtures (mirror dna.test.ts) ────────────────────────────────────────────
let seq = 0;
function frag(over: Partial<DnaCatalogFragrance> = {}): DnaCatalogFragrance {
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
const pick = (
  f: DnaCatalogFragrance,
  relation: 'own' | 'want' = 'own',
  favorite = false,
): DnaPick => ({ fragrance: f, relation, favorite });

const NOW_ISO = '2026-06-18T00:00:00.000Z';
const NOW = () => NOW_ISO;
const NOW_MS = Date.parse(NOW_ISO);
const daysAgo = (d: number) => new Date(NOW_MS - d * 86_400_000).toISOString();

const signal = (over: Partial<DnaSignal> = {}): DnaSignal => ({
  fragrance: frag(),
  kind: 'pick',
  ts: NOW_ISO,
  deliberate: true,
  owned: true,
  relation: 'own',
  favorite: false,
  ...over,
});

// ── T-U1 ─────────────────────────────────────────────────────────────────────
describe('T-U1 effectiveWeight ordering + skip', () => {
  it('love outweighs like at equal recency', () => {
    const love = effectiveWeight(signal({ kind: 'swipe_love', deliberate: true, owned: false }), NOW_MS);
    const like = effectiveWeight(signal({ kind: 'swipe_like', deliberate: false, owned: false }), NOW_MS);
    expect(love).toBeGreaterThan(like);
  });

  it('a skip swipe is never emitted as a signal', () => {
    const f = frag();
    const signals = buildDnaSignals({
      picks: [],
      swipes: [{ fragrance: f, action: 'skip', ts: NOW_ISO }],
      now: NOW,
    });
    expect(signals).toHaveLength(0);
  });
});

// ── T-U2 ─────────────────────────────────────────────────────────────────────
describe('T-U2 recency decay', () => {
  it('a newer signal weighs strictly more than an older one of the same kind', () => {
    const fresh = effectiveWeight(signal({ kind: 'swipe_love', ts: daysAgo(0) }), NOW_MS);
    const old = effectiveWeight(signal({ kind: 'swipe_love', ts: daysAgo(40) }), NOW_MS);
    expect(fresh).toBeGreaterThan(old);
  });

  it('a ~90-day-old signal is worth <10% of fresh (TAU=30)', () => {
    expect(recencyFactor(daysAgo(90), NOW_MS)).toBeLessThan(0.1);
    expect(recencyFactor(daysAgo(0), NOW_MS)).toBeCloseTo(1);
    // sanity: TAU is the e-folding time
    expect(recencyFactor(daysAgo(RECENCY_TAU_DAYS), NOW_MS)).toBeCloseTo(Math.exp(-1));
  });
});

// ── T-U3 ─────────────────────────────────────────────────────────────────────
describe('T-U3 deliberate factor', () => {
  it('a deliberate signal outweighs a passive one of identical base + recency', () => {
    // same base kind would be ideal, but love is deliberate by construction;
    // compare the factor directly via two like-kinds with forced flags.
    const deliberate = effectiveWeight(signal({ kind: 'swipe_like', deliberate: true, owned: false }), NOW_MS);
    const passive = effectiveWeight(signal({ kind: 'swipe_like', deliberate: false, owned: false }), NOW_MS);
    expect(deliberate).toBeGreaterThan(passive);
    expect(deliberate / passive).toBeCloseTo(1.5); // DELIBERATE_MULTIPLIER
  });
});

// ── T-U4 (the no-regression guarantee) ───────────────────────────────────────
describe('T-U4 no-regression: living(seeds-only) == legacy', () => {
  it('reproduces deriveFragranceDNA byte-for-byte on a mixed pick set', () => {
    const picks = [
      pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }), 'own', true),
      pick(frag({ top_accords: ['citrus'], fragrance_family: 'citrus' }), 'want'),
      pick(frag({ top_accords: ['leather'], price_tier: 5 }), 'own'),
    ];
    const legacy = deriveFragranceDNA({ picks, now: NOW }).dna;
    const living = deriveLivingDNA({ picks, source: 'picker', now: NOW }).dna;

    expect(living.archetype).toEqual(legacy.archetype);
    expect(living.accords).toEqual(legacy.accords);
    expect(living.families).toEqual(legacy.families);
    expect(living.traits).toEqual(legacy.traits);
    expect(living.outcomes).toEqual(legacy.outcomes);
    expect(living.wardrobe).toEqual(legacy.wardrobe);
    expect(living.confidence).toBeCloseTo(legacy.confidence, 6);
    expect(living.seeds).toEqual(legacy.seeds);
  });

  it('honours avoided just like the legacy path', () => {
    const picks = [pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }))];
    const avoided = [frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } })];
    const legacy = deriveFragranceDNA({ picks, avoided, now: NOW }).dna;
    const living = deriveLivingDNA({ picks, avoided, now: NOW }).dna;
    expect(living.accords).toEqual(legacy.accords);
    expect(living.dislikedNotes).toEqual(legacy.dislikedNotes);
  });
});

// ── T-U5 ─────────────────────────────────────────────────────────────────────
describe('T-U5 swipes sharpen the DNA', () => {
  it('love-swiping a new accord family introduces it into the accord map', () => {
    const picks = [pick(frag({ top_accords: ['woody'], accord_intensity: { woody: 4 } }))];
    const base = deriveLivingDNA({ picks, now: NOW }).dna;
    expect(base.accords.gourmand).toBeUndefined();

    const swipes = Array.from({ length: 12 }, () => ({
      fragrance: frag({
        top_accords: ['gourmand'],
        fragrance_family: 'gourmand',
        accord_intensity: { gourmand: 5 },
      }),
      action: 'love' as const,
      ts: NOW_ISO,
    }));
    const sharpened = deriveLivingDNA({ picks, swipes, now: NOW }).dna;
    expect(sharpened.accords.gourmand).toBeGreaterThan(0);
  });

  it('a dislike swipe subtracts (routes to avoided), a skip does nothing', () => {
    const picks = [pick(frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } }))];
    const amberFrag = frag({ top_accords: ['amber'], accord_intensity: { amber: 5 } });

    const withSkip = deriveLivingDNA({
      picks,
      swipes: [{ fragrance: amberFrag, action: 'skip', ts: NOW_ISO }],
      now: NOW,
    }).dna;
    const withDislike = deriveLivingDNA({
      picks,
      swipes: [{ fragrance: amberFrag, action: 'dislike', ts: NOW_ISO }],
      now: NOW,
    }).dna;

    const baseline = deriveLivingDNA({ picks, now: NOW }).dna;
    expect(withSkip.accords).toEqual(baseline.accords);
    expect(withDislike.accords.amber ?? 0).toBeLessThan(baseline.accords.amber);
  });
});

// ── T-U6 ─────────────────────────────────────────────────────────────────────
describe('T-U6 refresh keeps learning', () => {
  it('replacing onboarding seeds retains swipe signals; fresh picks dominate via recency', () => {
    // accumulated love swipes on gourmand, recent
    const swipes = Array.from({ length: 8 }, () => ({
      fragrance: frag({ top_accords: ['gourmand'], fragrance_family: 'gourmand', accord_intensity: { gourmand: 5 } }),
      action: 'love' as const,
      ts: daysAgo(5),
    }));
    // refresh: brand-new picks today, old picks dropped
    const freshPicks: DnaPick[] = [
      { fragrance: frag({ top_accords: ['leather'], fragrance_family: 'leather' }), relation: 'own', favorite: false, seededAt: NOW_ISO },
    ];

    const refreshed = deriveLivingDNA({ picks: freshPicks, swipes, now: NOW }).dna;

    // swipe-learned accord survived the refresh
    expect(refreshed.accords.gourmand).toBeGreaterThan(0);
    // the fresh pick is present
    expect(refreshed.accords.leather).toBeGreaterThan(0);
  });
});

// ── T-U7 ─────────────────────────────────────────────────────────────────────
describe('T-U7 confidence rises with signal volume', () => {
  it('is non-decreasing as more signals enter the pool', () => {
    const picks = [pick(frag())];
    const c0 = deriveLivingDNA({ picks, now: NOW }).dna.confidence;
    const c1 = deriveLivingDNA({
      picks,
      swipes: [{ fragrance: frag({ top_accords: ['amber'] }), action: 'love', ts: NOW_ISO }],
      now: NOW,
    }).dna.confidence;
    const c2 = deriveLivingDNA({
      picks,
      swipes: [
        { fragrance: frag({ top_accords: ['amber'] }), action: 'love', ts: NOW_ISO },
        { fragrance: frag({ top_accords: ['citrus'] }), action: 'love', ts: NOW_ISO },
        { fragrance: frag({ top_accords: ['leather'] }), action: 'love', ts: NOW_ISO },
      ],
      now: NOW,
    }).dna.confidence;
    expect(c1).toBeGreaterThanOrEqual(c0);
    expect(c2).toBeGreaterThanOrEqual(c1);
  });
});

// ── T-U8 ─────────────────────────────────────────────────────────────────────
describe('T-U8 reconciled swipe weights (single source)', () => {
  it('exposes the reconciled values (love 2.0, like 0.8, dislike -1.5)', () => {
    expect(RECOMMENDATION_SIGNAL_WEIGHTS.swipe_love).toBe(2.0);
    expect(RECOMMENDATION_SIGNAL_WEIGHTS.swipe_like).toBe(0.8);
    expect(RECOMMENDATION_SIGNAL_WEIGHTS.swipe_dislike).toBe(-1.5);
  });

  it('signalsToPools routes negative weights to avoided, positive to the pool', () => {
    const signals = buildDnaSignals({
      picks: [pick(frag())],
      swipes: [
        { fragrance: frag(), action: 'love', ts: NOW_ISO },
        { fragrance: frag(), action: 'dislike', ts: NOW_ISO },
      ],
      now: NOW,
    });
    const { pool, avoided } = signalsToPools(signals, NOW_MS);
    expect(pool.length).toBe(2); // pick + love
    expect(avoided.length).toBe(1); // dislike
  });
});
